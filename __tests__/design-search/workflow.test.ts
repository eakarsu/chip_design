/** @jest-environment node */
process.env.CHIP_DB_PATH = ':memory:';

import fs from 'fs';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import type { EdaIdentity } from '@/lib/eda/identity';
import { proposeRtlExperiments } from '@/lib/design-search/agent';
import { claimNextJob, completeJob, getJob, jobWorkspace } from '@/lib/eda/store';
import { readMeasuredMetrics } from '@/lib/eda/measuredMetrics';
import { getRevision, startJourney, launchJourneyRun, importDesignSearchSource } from '@/lib/journey/store';
import { expectedChecks } from '@/lib/journey/verification';
import type { DesignRevision, VerificationKind, VerificationReport } from '@/lib/journey/types';
import { adoptSelectedRtl, createSearchCampaign, dispatchRtlVerification, dispatchSearchCandidate, generateSearchCandidates, getSearchCampaign, searchCampaignDetails, selectSearchCandidate } from '@/lib/design-search/store';

jest.mock('@/lib/design-search/agent', () => ({ proposeExperiments: jest.fn(), proposeRtlExperiments: jest.fn() }));
jest.mock('@/lib/design-search/literature', () => ({ discoverLiterature: jest.fn().mockResolvedValue([{
  id: 'gcd-paper', title: 'GCD architecture paper', url: 'https://arxiv.org/abs/2107.02762',
  abstract: 'A candidate source for a hardware algorithm hypothesis.', origin: 'OpenAlex',
}]) }));

const editor: EdaIdentity = { tenantId: 'search-tenant-a', userId: 'engineer', role: 'editor' };
const reviewer: EdaIdentity = { ...editor, userId: 'reviewer', role: 'admin' };
const outsider: EdaIdentity = { tenantId: 'search-tenant-b', userId: 'outsider', role: 'admin' };
let root: string;

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'design-search-'));
  process.env.CHIP_EDA_OBJECT_DIR = path.join(root, 'eda');
  process.env.CHIP_OBJECT_STORAGE_ROOT = path.join(root, 'objects');
  for (const kind of ['SIMULATION', 'FORMAL', 'OPENROAD'])
    process.env[`CHIP_${kind}_IMAGE`] = `test/${kind.toLowerCase()}@sha256:${'a'.repeat(64)}`;
});
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

async function passVerification(revision: DesignRevision, kind: VerificationKind): Promise<string> {
  const purpose = revision.templateId === 'custom' ? 'regression' : 'lab';
  const execution = await launchJourneyRun(editor, revision.projectId,
    { revisionId: revision.id, kind, purpose, idempotencyKey: randomUUID() }, `verify-${kind}`);
  const claimed = claimNextJob(`verifier-${kind}`)!;
  expect(claimed.id).toBe(execution.jobId);
  const report: VerificationReport = {
    schemaVersion: 1, kind, outcome: 'passed', tool: 'fixture', toolVersion: 'fixture-1',
    suiteHash: execution.suiteHash, sourceHash: revision.sourceHash, seed: 2026,
    checks: (revision.templateId === 'custom' ? [kind === 'simulation' ? 'custom_test' : 'safety_contract'] : expectedChecks(revision.templateId, kind)).map((id) => ({
      id, requirementId: id, name: id, status: 'passed', message: 'Fixture passed',
    })),
    metrics: {}, waveforms: [], elapsedSeconds: 1,
    scope: 'Integration fixture proving that campaign dispatch checks retained verification evidence.',
  };
  const reportPath = path.join(jobWorkspace(claimed), 'output', 'verification-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report));
  completeJob(claimed.id, `verifier-${kind}`, {});
  return reportPath;
}

function completePhysicalFixture(expectedJobId: string, dieAreaUm2: number): string {
  const claimed = claimNextJob('physical-worker')!;
  expect(claimed.id).toBe(expectedJobId);
  const output = path.join(jobWorkspace(claimed), 'output');
  fs.mkdirSync(path.join(output, 'logs'), { recursive: true });
  fs.mkdirSync(path.join(output, 'reports'), { recursive: true });
  fs.mkdirSync(path.join(output, 'results'), { recursive: true });
  const reportPath = path.join(output, 'logs', '6_report.json');
  fs.writeFileSync(reportPath, JSON.stringify({
    finish__design__die__area: dieAreaUm2,
    finish__power__total: 0.002,
    finish__timing__fmax: 120_000_000,
    finish__timing__setup__ws: 1,
    finish__timing__hold__ws: 0.1,
    finish__timing__setup__tns: 0,
    finish__timing__hold__tns: 0,
    finish__flow__errors__count: 0,
  }));
  fs.writeFileSync(path.join(output, 'reports', '5_route_drc.rpt'), '');
  fs.writeFileSync(path.join(output, 'results', '6_final.gds'), 'fixture-gds');
  const metrics = readMeasuredMetrics(output, 'openroad');
  expect(metrics).toMatchObject({ dieAreaUm2, powerMw: 2, fmaxMHz: 120, drcViolations: 0 });
  completeJob(claimed.id, 'physical-worker', metrics);
  return reportPath;
}

it('gates dispatch on fixed verification, scores retained ORFS reports, and rejects tampering', async () => {
  const revision = await startJourney(editor, { name: 'Agent campaign GCD', templateId: 'gcd' }, 'start-search');
  const campaign = await createSearchCampaign(editor, {
    projectId: revision.projectId, revisionId: revision.id, objective: 'min_area', topic: 'placement',
    maxCandidates: 3, maxCpuSeconds: 600, jobCpuSeconds: 600,
  }, 'create-search');
  await expect(getSearchCampaign(outsider, campaign.id)).rejects.toThrow(/not found/);
  const initial = await searchCampaignDetails(editor, campaign.id);
  expect(initial.candidates).toHaveLength(1);
  expect(initial.candidates[0].status).toBe('proposed');
  await expect(dispatchSearchCandidate(editor, campaign.id, initial.candidates[0].id, 'blocked'))
    .rejects.toThrow(/simulation and bounded formal/);

  const simulationReportPath = await passVerification(revision, 'simulation');
  await passVerification(revision, 'formal');
  const ready = await searchCampaignDetails(editor, campaign.id);
  expect(ready.verification).toEqual({ simulationPassed: true, formalPassed: true });
  const submitted = await dispatchSearchCandidate(editor, campaign.id, ready.candidates[0].id, 'dispatch');
  expect(submitted.usedCpuSeconds).toBe(600);
  expect(submitted.candidates[0].status).toBe('queued');
  const reportPath = completePhysicalFixture(submitted.candidates[0].jobId!, 1000);
  const evaluated = await searchCampaignDetails(editor, campaign.id);
  expect(evaluated.candidates[0]).toMatchObject({ qualified: true, pareto: true, score: 1000 });
  expect(evaluated.bestCandidateId).toBe(initial.candidates[0].id);
  await expect(selectSearchCandidate(editor, campaign.id, initial.candidates[0].id,
    'The measured area meets the locked objective.', 'editor-select')).rejects.toThrow(/Admin/);
  const selected = await selectSearchCandidate(reviewer, campaign.id, initial.candidates[0].id,
    'The measured area meets the locked objective with clean timing and routing evidence.', 'review-select');
  expect(selected.campaign.selectedCandidateId).toBe(initial.candidates[0].id);

  const originalSimulation = fs.readFileSync(simulationReportPath);
  fs.writeFileSync(simulationReportPath, 'changed-verification-report');
  const invalidVerification = await searchCampaignDetails(editor, campaign.id);
  expect(invalidVerification.verification.simulationPassed).toBe(false);
  expect(invalidVerification.candidates[0]).toMatchObject({ qualified: false, status: 'rejected' });
  fs.writeFileSync(simulationReportPath, originalSimulation);

  fs.writeFileSync(reportPath, JSON.stringify({ finish__design__die__area: 1 }));
  const tampered = await searchCampaignDetails(editor, campaign.id);
  expect(tampered.candidates[0].qualified).toBe(false);
  expect(tampered.candidates[0].reasons[0]).toMatch(/checksum/);
  await expect(selectSearchCandidate(reviewer, campaign.id, initial.candidates[0].id,
    'Trying to select a result after its report was changed.', 'invalid-select')).rejects.toThrow(/qualified/);
});

it('keeps generated GCD RTL separate and gates physical ranking on its own verification evidence', async () => {
  const revision = await startJourney(editor, { name: 'RTL algorithm campaign', templateId: 'gcd' }, 'start-rtl-search');
  await passVerification(revision, 'simulation');
  await passVerification(revision, 'formal');
  const campaign = await createSearchCampaign(editor, {
    projectId: revision.projectId, revisionId: revision.id, objective: 'min_area', topic: 'rtl',
    maxCandidates: 2, maxCpuSeconds: 1200, jobCpuSeconds: 600,
  }, 'create-rtl-search');
  const baseline = (await searchCampaignDetails(editor, campaign.id)).candidates[0];
  await dispatchSearchCandidate(editor, campaign.id, baseline.id, 'dispatch-rtl-baseline');
  completePhysicalFixture((await searchCampaignDetails(editor, campaign.id)).candidates[0].jobId!, 1000);

  const candidateRtl = revision.rtl.replace('  reg [7:0] a, b;', '  reg [7:0] a, b;\n  wire [7:0] a_minus_b = a - b;')
    .replace('a <= a - b;', 'a <= a_minus_b;');
  (proposeRtlExperiments as jest.Mock).mockResolvedValueOnce({ model: 'approved/test-model', proposals: [{
    title: 'Shared subtractor datapath',
    hypothesis: 'A shared subtraction expression may alter the mapped datapath area while preserving the GCD protocol.',
    sourceIds: ['gcd-paper'], rtl: candidateRtl,
  }] });
  const proposed = await generateSearchCandidates(editor, campaign.id, 'propose-rtl');
  const candidate = proposed.candidates.find((item) => item.kind === 'rtl')!;
  expect(candidate.rtl).toBe(candidateRtl.trim());
  await expect(dispatchSearchCandidate(editor, campaign.id, candidate.id, 'physical-too-early'))
    .rejects.toThrow(/simulation, bounded safety, and exact-cycle equivalence/);

  const queued = await dispatchRtlVerification(editor, campaign.id, candidate.id, 'verify-rtl');
  const withJobs = queued.candidates.find((item) => item.id === candidate.id)!;
  expect(withJobs.verification).toMatchObject({ simulationPassed: false, formalPassed: false, proofPassed: false });
  for (const kind of ['simulation', 'formal', 'equivalence'] as const) {
    const workerId = `rtl-${kind}`;
    const claimed = claimNextJob(workerId)!;
    expect(claimed.id).toBe(kind === 'simulation' ? withJobs.simulationJobId : kind === 'formal' ? withJobs.formalJobId : withJobs.proofJobId);
    const contract = JSON.parse(fs.readFileSync(path.join(jobWorkspace(claimed), 'input', 'verification.json'), 'utf8'));
    const report: VerificationReport = {
      schemaVersion: 1, kind: kind === 'simulation' ? 'simulation' : 'formal', outcome: 'passed', tool: 'fixture', toolVersion: 'fixture-1',
      suiteHash: contract.suiteHash, sourceHash: contract.sourceHash, seed: contract.seed,
      checks: (kind === 'equivalence' ? ['equivalence'] : expectedChecks('gcd', kind)).map((id) => ({ id, requirementId: id, name: id, status: 'passed', message: 'Fixture passed' })),
      metrics: {}, waveforms: [], elapsedSeconds: 1, scope: 'Isolated candidate verification fixture',
    };
    fs.writeFileSync(path.join(jobWorkspace(claimed), 'output', 'verification-report.json'), JSON.stringify(report));
    completeJob(claimed.id, workerId, {});
  }
  const verified = await searchCampaignDetails(editor, campaign.id);
  expect(verified.candidates.find((item) => item.id === candidate.id)?.verification)
    .toMatchObject({ simulationPassed: true, formalPassed: true, proofPassed: true });
  const dispatched = await dispatchSearchCandidate(editor, campaign.id, candidate.id, 'physical-rtl');
  completePhysicalFixture(dispatched.candidates.find((item) => item.id === candidate.id)?.jobId!, 800);
  const measured = await searchCampaignDetails(editor, campaign.id);
  expect(measured.candidates.find((item) => item.id === candidate.id)).toMatchObject({ qualified: true, score: 800 });
  expect(measured.bestCandidateId).toBe(candidate.id);
  await selectSearchCandidate(reviewer, campaign.id, candidate.id,
    'The changed RTL passes its fixed checks and improves routed area at the same constraints.', 'select-rtl');
  await expect(adoptSelectedRtl(editor, campaign.id, 'adopt-without-review')).rejects.toThrow(/Admin/);
  const adopted = await adoptSelectedRtl(reviewer, campaign.id, 'adopt-rtl');
  expect((await getRevision(reviewer, revision.projectId))?.id).toBe(adopted.adoptedRevisionId);
  expect((await getRevision(reviewer, revision.projectId))?.rtl).toBe(candidateRtl.trim());

  const formalJob = path.join(jobWorkspace(getJob(editor, withJobs.formalJobId!)!), 'output', 'verification-report.json');
  fs.writeFileSync(formalJob, 'changed-verification-report');
  const invalid = await searchCampaignDetails(editor, campaign.id);
  expect(invalid.candidates.find((item) => item.id === candidate.id)).toMatchObject({ qualified: false, status: 'rejected' });
});

it('accepts an imported RTL project with its own regression suite', async () => {
  const reference = await startJourney(editor, { name: 'Import source reference', templateId: 'mac' }, 'source-for-import');
  const revision = await importDesignSearchSource(editor, {
    name: 'Imported MAC design', topModule: reference.topModule,
    specification: 'An imported MAC circuit with a separately retained testbench and formal harness.',
    rtl: reference.rtl, sdc: reference.sdc, testbench: reference.testbench, properties: reference.properties,
  }, 'import-mac');
  expect(revision.templateId).toBe('custom');
  await passVerification(revision, 'simulation');
  await passVerification(revision, 'formal');
  const campaign = await createSearchCampaign(editor, {
    projectId: revision.projectId, revisionId: revision.id, objective: 'min_area', topic: 'rtl',
    maxCandidates: 2, maxCpuSeconds: 1200, jobCpuSeconds: 600,
  }, 'search-imported-mac');
  const details = await searchCampaignDetails(editor, campaign.id);
  expect(details.verification).toEqual({ simulationPassed: true, formalPassed: true });
  const submitted = await dispatchSearchCandidate(editor, campaign.id, details.candidates[0].id, 'dispatch-imported');
  expect(submitted.candidates[0].status).toBe('queued');
  completePhysicalFixture(submitted.candidates[0].jobId!, 1000);
});
