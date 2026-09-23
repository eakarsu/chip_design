/** @jest-environment node */
process.env.CHIP_DB_PATH = ':memory:';

import fs from 'fs';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import type { EdaIdentity } from '@/lib/eda/identity';
import type { DesignRevision, VerificationKind, VerificationReport } from '@/lib/journey/types';
import { expectedChecks } from '@/lib/journey/verification';
import { launchJourneyRun, startJourney } from '@/lib/journey/store';
import { claimNextJob, completeJob, jobWorkspace } from '@/lib/eda/store';
import { readMeasuredMetrics } from '@/lib/eda/measuredMetrics';
import { createSearchCampaign, dispatchSearchCandidate, searchCampaignDetails } from '@/lib/design-search/store';
import { agentTeamForCampaign, runAgentWorker, startAgentTeam } from '@/lib/design-search/team';
import { proposeExperiments } from '@/lib/design-search/agent';
import { critiqueCandidates, researchDirections } from '@/lib/design-search/roles';
import { run } from '@/lib/commercial/database';

jest.mock('@/lib/design-search/agent', () => ({ proposeExperiments: jest.fn(), proposeRtlExperiments: jest.fn() }));
jest.mock('@/lib/design-search/roles', () => ({ researchDirections: jest.fn(), critiqueCandidates: jest.fn() }));
jest.mock('@/lib/design-search/literature', () => ({ discoverLiterature: jest.fn().mockResolvedValue([{
  id: 'fixture-paper', title: 'Placement reference', url: 'https://example.org/paper',
  abstract: 'A testable placement density hypothesis with no claimed measurement.', origin: 'Reference',
}]) }));

const editor: EdaIdentity = { tenantId: 'agent-team-tenant', userId: 'engineer', role: 'editor' };
const outsider: EdaIdentity = { tenantId: 'other-tenant', userId: 'outsider', role: 'admin' };
let root: string;

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'design-team-'));
  process.env.CHIP_EDA_OBJECT_DIR = path.join(root, 'eda');
  process.env.CHIP_OBJECT_STORAGE_ROOT = path.join(root, 'objects');
  for (const kind of ['SIMULATION', 'FORMAL', 'OPENROAD'])
    process.env[`CHIP_${kind}_IMAGE`] = `test/${kind.toLowerCase()}@sha256:${'b'.repeat(64)}`;
});
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

async function passReference(revision: DesignRevision, kind: VerificationKind): Promise<void> {
  const execution = await launchJourneyRun(editor, revision.projectId,
    { revisionId: revision.id, kind, purpose: 'lab', idempotencyKey: randomUUID() }, `reference-${kind}`);
  const worker = `reference-worker-${kind}`;
  const claimed = claimNextJob(worker)!;
  expect(claimed.id).toBe(execution.jobId);
  const report: VerificationReport = {
    schemaVersion: 1, kind, outcome: 'passed', tool: 'fixture', toolVersion: 'fixture-1',
    suiteHash: execution.suiteHash, sourceHash: revision.sourceHash, seed: 2026,
    checks: expectedChecks(revision.templateId, kind).map((id) => ({
      id, requirementId: id, name: id, status: 'passed', message: 'Fixture passed',
    })),
    metrics: {}, waveforms: [], elapsedSeconds: 1, scope: 'Agent team reference integration fixture',
  };
  fs.writeFileSync(path.join(jobWorkspace(claimed), 'output', 'verification-report.json'), JSON.stringify(report));
  completeJob(claimed.id, worker, {});
}

function finishPhysical(jobId: string, area: number): void {
  const worker = `physical-worker-${area}`;
  const claimed = claimNextJob(worker)!;
  expect(claimed.id).toBe(jobId);
  const output = path.join(jobWorkspace(claimed), 'output');
  fs.mkdirSync(path.join(output, 'logs'), { recursive: true });
  fs.mkdirSync(path.join(output, 'reports'), { recursive: true });
  fs.mkdirSync(path.join(output, 'results'), { recursive: true });
  fs.writeFileSync(path.join(output, 'logs', '6_report.json'), JSON.stringify({
    finish__design__die__area: area, finish__power__total: 0.002,
    finish__timing__fmax: 120_000_000, finish__timing__setup__ws: 1,
    finish__timing__hold__ws: 0.1, finish__timing__setup__tns: 0,
    finish__timing__hold__tns: 0, finish__flow__errors__count: 0,
  }));
  fs.writeFileSync(path.join(output, 'reports', '5_route_drc.rpt'), '');
  fs.writeFileSync(path.join(output, 'results', '6_final.gds'), 'fixture-gds');
  completeJob(claimed.id, worker, readMeasuredMetrics(output, 'openroad'));
}

it('runs separate research, design, and critique steps and executes only an approved candidate', async () => {
  const revision = await startJourney(editor, { name: 'Agent team placement', templateId: 'gcd' }, 'start-agent-test');
  await passReference(revision, 'simulation');
  await passReference(revision, 'formal');
  const campaign = await createSearchCampaign(editor, {
    projectId: revision.projectId, revisionId: revision.id, objective: 'min_area', topic: 'placement',
    maxCandidates: 3, maxCpuSeconds: 1800, jobCpuSeconds: 600,
  }, 'create-agent-test');
  const baseline = (await searchCampaignDetails(editor, campaign.id)).candidates[0];
  await dispatchSearchCandidate(editor, campaign.id, baseline.id, 'baseline-agent-test');
  finishPhysical((await searchCampaignDetails(editor, campaign.id)).candidates[0].jobId!, 1000);

  (researchDirections as jest.Mock).mockResolvedValue({ model: 'approved/research', brief: {
    brief: 'Compare bounded placement density and core utilization against the locked baseline.',
    sourceIds: ['fixture-paper'], questions: ['Does the routed area improve under fixed timing constraints?'],
  } });
  (proposeExperiments as jest.Mock).mockResolvedValue({ model: 'approved/design', proposals: [
    { title: 'Approved density experiment', hypothesis: 'A lower placement density may reduce routed area under fixed timing constraints.',
      sourceIds: ['fixture-paper'], coreUtilization: 40, placeDensity: 0.5 },
    { title: 'Rejected density experiment', hypothesis: 'A higher placement density may reduce routed area under fixed timing constraints.',
      sourceIds: ['fixture-paper'], coreUtilization: 45, placeDensity: 0.65 },
  ] });
  (critiqueCandidates as jest.Mock).mockImplementation(async ({ candidates }) => ({ model: 'approved/critic',
    reviews: candidates.map((candidate: { id: string }, index: number) => ({ candidateId: candidate.id,
      approve: index === 0, reason: index === 0
        ? 'This bounded experiment has a testable hypothesis and fixed verification controls.'
        : 'This experiment is rejected by the independent critic before any tool execution.',
      risks: ['Routed timing may regress'],
    })),
  }));

  const started = await startAgentTeam(editor, campaign.id);
  const agentId = started.run!.id;
  await expect(agentTeamForCampaign(outsider, campaign.id)).rejects.toThrow(/not found/);
  const tick = async () => {
    await run('UPDATE design_search_agent_runs SET next_attempt_at=? WHERE id=?',
      [new Date(0).toISOString(), agentId]);
    await runAgentWorker({ once: true });
    return agentTeamForCampaign(editor, campaign.id);
  };
  expect((await tick()).run?.phase).toBe('reference');
  expect((await tick()).run?.phase).toBe('baseline');
  expect((await tick()).run?.phase).toBe('design');
  expect((await tick()).run?.phase).toBe('critique');
  expect((await tick()).run?.phase).toBe('execute');
  const dispatched = await tick();
  expect(dispatched.run?.status).toBe('waiting');
  expect(dispatched.reviews.map((review) => review.verdict)).toEqual(['approved', 'rejected']);
  const candidates = (await searchCampaignDetails(editor, campaign.id)).candidates.filter((item) => item.kind !== 'baseline');
  expect(candidates).toHaveLength(2);
  expect(candidates[0].jobId).toBeTruthy();
  expect(candidates[1].jobId).toBeUndefined();
  finishPhysical(candidates[0].jobId!, 900);

  expect((await tick()).run?.phase).toBe('evaluate');
  const finished = await tick();
  expect(finished.run?.status).toBe('completed');
  expect(finished.events.map((item) => item.role)).toEqual(expect.arrayContaining([
    'research', 'design', 'critic', 'verification', 'evaluation',
  ]));
  expect((await searchCampaignDetails(editor, campaign.id)).bestCandidateId).toBe(candidates[0].id);
  expect(proposeExperiments).toHaveBeenCalledTimes(1);
});
