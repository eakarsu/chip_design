/** @jest-environment node */
process.env.CHIP_DB_PATH = ':memory:';

import fs from 'fs';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import { gunzipSync } from 'zlib';
import { getRawDb } from '@/lib/db/connection';
import type { EdaIdentity } from '@/lib/eda/identity';
import {
  claimNextJob,
  completeJob,
  getJob,
  jobWorkspace,
  verifyJobInputs,
  purgeExpired,
  listAudit,
} from '@/lib/eda/store';
import {
  getJourneyRun,
  getRevision,
  gradeJourneyRun,
  journeyBundle,
  journeyRunInputs,
  launchJourneyRun,
  reviewExplanation,
  saveRevision,
  startChallenge,
  startJourney,
} from '@/lib/journey/store';
import { projectAiContext } from '@/lib/journey/aiContext';
import { adaptivePractice } from '@/lib/journey/adaptive';
import { expectedChecks } from '@/lib/journey/verification';
import { exportJourney, hardwareChecklist, importHardwareMeasurements, saveHardwareStep } from '@/lib/journey/hardware';
import { submitAcademyLab } from '@/lib/academy/store';
import type { DesignRevision, JourneyRun, VerificationReport, VerificationKind } from '@/lib/journey/types';

const learner: EdaIdentity = { tenantId: 'journey-a', userId: 'student', role: 'editor' };
const teacher: EdaIdentity = { ...learner, userId: 'teacher', role: 'admin' };
const other: EdaIdentity = { tenantId: 'journey-b', userId: 'other', role: 'admin' };
const explanation =
  'The retained test exercises accepted transfers and backpressure. I checked the failing cycle, fixed the boundary comparison, and reran the same source and suite. Physical timing remains outside this simulation scope.';
let root: string;
beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'journey-workflow-'));
  process.env.CHIP_EDA_OBJECT_DIR = path.join(root, 'eda');
  process.env.CHIP_OBJECT_STORAGE_ROOT = path.join(root, 'hardware');
  for (const kind of ['SIMULATION', 'FORMAL', 'YOSYS', 'OPENROAD'])
    process.env[`CHIP_${kind}_IMAGE`] = `verification/test@sha256:${'a'.repeat(64)}`;
});
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

function sourceInput(revision: DesignRevision) {
  const { templateId, topModule, specification, requirements, rtl, sdc, testbench, properties } = revision;
  return {
    baseRevisionId: revision.id,
    templateId,
    topModule,
    specification,
    requirements,
    rtl,
    sdc,
    testbench,
    properties,
  };
}
async function completed(
  revision: DesignRevision,
  failed?: string,
  purpose: 'lab' | 'regression' = 'lab',
  kind: VerificationKind = 'simulation'
): Promise<JourneyRun> {
  const execution = await launchJourneyRun(
    learner,
    revision.projectId,
    { revisionId: revision.id, kind, purpose, idempotencyKey: randomUUID() },
    'queue'
  );
  const job = claimNextJob('journey-test-worker')!;
  expect(job.id).toBe(execution.jobId);
  const report: VerificationReport = {
    schemaVersion: 1,
    kind,
    outcome: failed ? 'failed' : 'passed',
    tool: 'unit-test fixture',
    toolVersion: 'fixture-1',
    suiteHash: execution.suiteHash,
    sourceHash: execution.sourceHash,
    seed: 2026,
    checks: expectedChecks(revision.templateId, kind).map((id) => ({
      id,
      requirementId: id === 'reset_state' ? 'reset' : id,
      name: id,
      status: id === failed ? 'failed' : 'passed',
      message: id === failed ? 'Observed protocol violation at cycle 5' : 'Fixture success',
    })),
    metrics: {},
    waveforms: [],
    elapsedSeconds: 1,
    scope: 'Unit-test fixture for persistence and authorization; real-tool tests are separate.',
  };
  fs.writeFileSync(path.join(jobWorkspace(job), 'output', 'verification-report.json'), JSON.stringify(report));
  completeJob(job.id, 'journey-test-worker', {});
  return getJourneyRun(learner, revision.projectId, execution.id);
}

it('keeps immutable revisions, rejects stale saves and prevents cross-tenant/project access', async () => {
  const revision = await startJourney(learner, { name: 'Revision test', templateId: 'gcd' }, 'start');
  const saved = await saveRevision(
    learner,
    revision.projectId,
    { ...sourceInput(revision), rtl: revision.rtl + '\n// revision two' },
    'save'
  );
  expect(saved.sourceHash).not.toBe(revision.sourceHash);
  expect((await getRevision(learner, revision.projectId, revision.id))?.rtl).toBe(revision.rtl);
  await expect(saveRevision(learner, revision.projectId, sourceInput(revision), 'stale')).rejects.toThrow(/conflict/);
  await expect(getRevision(other, revision.projectId)).rejects.toThrow(/not found/);
  await expect(
    saveRevision({ ...learner, role: 'viewer' }, revision.projectId, sourceInput(saved), 'viewer')
  ).rejects.toThrow(/Editor/);
  const second = await startJourney(learner, { name: 'Other project', templateId: 'gcd' }, 'start-other');
  await expect(getRevision(learner, second.projectId, revision.id)).rejects.toThrow(/not found/);
});

it('grades executed checks independently, records challenges and refuses custom-suite credit', async () => {
  const revision = await startJourney(learner, { name: 'FIFO practice', templateId: 'fifo' }, 'start');
  const broken = await startChallenge(learner, revision.projectId, 'fifo-overflow', revision.id, 'challenge');
  const failedRun = await completed(broken, 'backpressure');
  const failed = await gradeJourneyRun(learner, revision.projectId, failedRun.id, explanation, 'grade');
  expect(failed).toMatchObject({
    technicalPassed: false,
    correctness: 45,
    reproducibility: 25,
    explanationScore: null,
    challengeId: 'fifo-overflow',
  });
  const fixed = await saveRevision(learner, revision.projectId, { ...sourceInput(broken), rtl: revision.rtl }, 'fix');
  const run = await completed(fixed);
  const grade = await gradeJourneyRun(learner, revision.projectId, run.id, explanation, 'grade-fix');
  expect(grade).toMatchObject({ technicalPassed: true, correctness: 60, reproducibility: 25, explanationScore: null });
  await expect(gradeJourneyRun(teacher, revision.projectId, run.id, explanation, 'stolen-credit')).rejects.toThrow(
    /own/
  );
  await expect(
    reviewExplanation({ ...learner, role: 'admin' }, revision.projectId, grade.id, 15, explanation, 'self')
  ).rejects.toThrow(/independent/);
  const reviewed = await reviewExplanation(teacher, revision.projectId, grade.id, 12, explanation, 'review');
  expect(reviewed.explanationScore).toBe(12);
  const submission = await submitAcademyLab(
    learner,
    {
      labSlug: 'rtl-design-lab',
      response: fixed.rtl,
      evidence: [],
      execution: { projectId: revision.projectId, runId: run.id },
    },
    'academy'
  );
  expect(submission.grade).toMatchObject({ passed: true, score: 97 });
  await expect(
    submitAcademyLab(
      learner,
      {
        labSlug: 'rtl-design-lab',
        response: fixed.rtl + '\nassign bogus=1;',
        evidence: [],
        execution: { projectId: revision.projectId, runId: run.id },
      },
      'academy-mismatch'
    )
  ).rejects.toThrow(/match/);
  const custom = await completed(fixed, undefined, 'regression');
  await expect(gradeJourneyRun(learner, revision.projectId, custom.id, explanation, 'custom')).rejects.toThrow(
    /fixed grading/
  );
});

it('rejects forged artifacts, changed retained inputs and AI attachments from another revision', async () => {
  const revision = await startJourney(learner, { name: 'Evidence integrity', templateId: 'gcd' }, 'start');
  const run = await completed(revision);
  const selection = {
    projectId: revision.projectId,
    revisionId: revision.id,
    runId: run.id,
    includeRtl: false,
    includeConstraints: false,
    includeReport: true,
    artifactIds: [],
    view: 'learn',
    hintLevel: 2,
  };
  const context = await projectAiContext(learner, selection);
  expect(JSON.parse(context.context).excerpts.map((item: { source: string }) => item.source)).toEqual([
    'verified execution report',
  ]);
  expect(context.instruction).toMatch(/Level 2/);
  await expect(projectAiContext(other, selection)).rejects.toThrow(/not found/);
  const next = await saveRevision(
    learner,
    revision.projectId,
    { ...sourceInput(revision), rtl: revision.rtl + '\n// next' },
    'save'
  );
  await expect(projectAiContext(learner, { ...selection, revisionId: next.id })).rejects.toThrow(/different revision/);
  await expect(projectAiContext(learner, { ...selection, artifactIds: [randomUUID()] })).rejects.toThrow(
    /not a supported/
  );
  const job = getJob(learner, run.jobId)!;
  const output = path.join(jobWorkspace(job), 'output', 'verification-report.json');
  fs.writeFileSync(output, fs.readFileSync(output, 'utf8').replace('Fixture success', 'Forged success!'));
  expect((await getJourneyRun(learner, revision.projectId, run.id)).reportError).toMatch(/checksum/);
  const grade = await gradeJourneyRun(learner, revision.projectId, run.id, explanation, 'tampered-grade');
  expect(grade).toMatchObject({ technicalPassed: false, correctness: 0, reproducibility: 0 });
  fs.appendFileSync(path.join(jobWorkspace(job), 'input', 'design.v'), '\n// altered');
  expect(() => verifyJobInputs(job)).toThrow(/checksum/);
  await expect(journeyRunInputs(learner, revision.projectId, run.id)).rejects.toThrow(/integrity/);
});

it('binds hardware results to revision, units and retained evidence; exports a real archive', async () => {
  const revision = await startJourney(learner, { name: 'Hardware validation', templateId: 'gcd' }, 'hardware');
  const report = {
    schemaVersion: 1,
    projectId: revision.projectId,
    revisionId: revision.id,
    sourceHash: revision.sourceHash,
    stage: 'board',
    device: 'fixture-board',
    instrument: 'unit-test fixture import',
    measuredAt: '2026-01-01T00:00:00.000Z',
    measurements: [{ requirementId: 'latency', observed: 261, unit: 'cycles' }],
  };
  await expect(
    importHardwareMeasurements(
      learner,
      revision.projectId,
      JSON.stringify({ ...report, sourceHash: 'f'.repeat(64) }),
      'wrong'
    )
  ).rejects.toThrow(/does not match/);
  await expect(
    importHardwareMeasurements(
      learner,
      revision.projectId,
      JSON.stringify({ ...report, measurements: [{ requirementId: 'latency', observed: 1, unit: 'ns' }] }),
      'wrong-units'
    )
  ).rejects.toThrow(/unit/);
  const records = await importHardwareMeasurements(learner, revision.projectId, JSON.stringify(report), 'import');
  expect(records[0].passed).toBe(false);
  expect((await importHardwareMeasurements(learner, revision.projectId, JSON.stringify(report), 'replay'))[0].id).toBe(
    records[0].id
  );
  await saveHardwareStep(
    learner,
    revision.projectId,
    {
      revisionId: revision.id,
      stepId: 'functional-vectors',
      notes: 'The cycle budget was exceeded and needs investigation before release.',
      evidenceArtifactId: records[0].evidenceArtifactId,
    },
    'check'
  );
  expect(
    (await hardwareChecklist(learner, revision.projectId, revision.id)).find((item) => item.id === 'functional-vectors')
      ?.record
  ).toBeTruthy();
  await expect(
    saveHardwareStep(
      learner,
      revision.projectId,
      {
        revisionId: revision.id,
        stepId: 'independent-review',
        notes: explanation,
        evidenceArtifactId: records[0].evidenceArtifactId,
      },
      'review'
    )
  ).rejects.toThrow(/independent artifact approval/);
  const archive = await exportJourney(learner, revision.projectId, revision.id, 'tinytapeout');
  expect(archive.subarray(0, 2)).toEqual(Buffer.from([0x1f, 0x8b]));
  const bundle = await journeyBundle(learner, revision.projectId);
  expect(bundle.measurements).toHaveLength(1);
});

it('requires fixed simulation acceptance evidence for challenge credit, including historical assessments', async () => {
  const original = await startJourney(learner, { name: 'Clock challenge credit', templateId: 'gcd' }, 'start');
  const broken = await startChallenge(learner, original.projectId, 'clock-budget', original.id, 'challenge');
  const formal = await completed(broken, undefined, 'lab', 'formal');
  await expect(gradeJourneyRun(learner, broken.projectId, formal.id, explanation, 'grade')).rejects.toThrow(
    /fixed simulation/
  );
  const fixed = await saveRevision(learner, broken.projectId, { ...sourceInput(broken), sdc: original.sdc }, 'fix');
  const simulation = await completed(fixed);
  const assessment = await gradeJourneyRun(learner, fixed.projectId, simulation.id, explanation, 'grade');
  const solved = (runs: JourneyRun[], grade = assessment) =>
    adaptivePractice('gcd', runs, [grade]).challenges.find((item) => item.id === 'clock-budget')?.solved;
  expect(solved([simulation])).toBe(true);
  expect(solved([formal], { ...assessment, runId: formal.id, revisionId: formal.revisionId })).toBe(false);
  expect(solved([simulation], { ...assessment, revisionId: broken.id })).toBe(false);
  expect(solved([simulation], { ...assessment, userId: 'another-learner' })).toBe(false);
  expect(solved([{ ...simulation, purpose: 'regression' }])).toBe(false);
  expect(solved([{ ...simulation, reportError: 'checksum mismatch' }])).toBe(false);
  expect(solved([{ ...simulation, report: { ...simulation.report!, sourceHash: 'f'.repeat(64) } }])).toBe(false);
  expect(
    solved([
      {
        ...simulation,
        report: {
          ...simulation.report!,
          checks: simulation.report!.checks.filter((check) => check.id !== 'constraint_contract'),
        },
      },
    ])
  ).toBe(false);
});

function archiveFiles(archive: Buffer): Record<string, string> {
  const body = gunzipSync(archive);
  const files: Record<string, string> = {};
  for (let offset = 0; offset < body.length && body[offset]; ) {
    const name = body
      .subarray(offset, offset + 100)
      .toString()
      .split('\0')[0];
    const size = parseInt(body.subarray(offset + 124, offset + 136).toString(), 8);
    files[name] = body.subarray(offset + 512, offset + 512 + size).toString();
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  return files;
}

it('exports sources and available runs after expiry, records expiry once and refuses unexplained missing evidence', async () => {
  const revision = await startJourney(learner, { name: 'Retained export', templateId: 'gcd' }, 'start');
  const expired = await completed(revision);
  const retained = await completed(revision);
  const job = getJob(learner, expired.jobId)!;
  const input = path.join(jobWorkspace(job), 'input', 'design.v');
  fs.unlinkSync(input);
  await expect(exportJourney(learner, revision.projectId, revision.id, 'engineering')).rejects.toThrow(/ENOENT/);
  fs.writeFileSync(input, revision.rtl);
  getRawDb().prepare('UPDATE eda_jobs SET retention_until=? WHERE id=?').run('2000-01-01', expired.jobId);
  expect(purgeExpired()).toBe(1);
  expect(purgeExpired()).toBe(0);
  expect(
    listAudit(learner).filter((event) => event.job_id === job.id && event.action === 'job.artifacts-expired')
  ).toHaveLength(1);
  const after = await getJourneyRun(learner, revision.projectId, expired.id);
  expect(after.artifactsExpiredAt).toBeTruthy();
  expect(after.reportError).toMatch(/expired/);
  await expect(journeyRunInputs(learner, revision.projectId, expired.id)).rejects.toThrow(/expired/);
  for (const target of ['engineering', 'tinytapeout'] as const) {
    const files = archiveFiles(await exportJourney(learner, revision.projectId, revision.id, target));
    expect(files['src/design.v']).toBe(revision.rtl);
    expect(files[`runs/${expired.id}/inputs/design.v`]).toBeUndefined();
    expect(files[`runs/${retained.id}/inputs/design.v`]).toBe(revision.rtl);
    expect(JSON.parse(files[`runs/${expired.id}/provenance.json`])).toMatchObject({
      evidenceStatus: 'expired',
      artifactsExpiredAt: after.artifactsExpiredAt,
    });
    expect(JSON.parse(files['manifest.json']).runs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: expired.id,
          evidenceStatus: 'expired',
          artifactsExpiredAt: after.artifactsExpiredAt,
        }),
        expect.objectContaining({ id: retained.id, evidenceStatus: 'retained', outcome: 'passed' }),
      ])
    );
  }
  getRawDb().prepare('UPDATE eda_jobs SET retention_until=? WHERE id=?').run('2000-01-01', retained.jobId);
  expect(purgeExpired()).toBe(1);
  const files = archiveFiles(await exportJourney(learner, revision.projectId, revision.id, 'engineering'));
  expect(files['src/design.v']).toBe(revision.rtl);
  expect(
    JSON.parse(files['manifest.json']).runs.every(
      (item: { evidenceStatus: string; outcome?: string }) => item.evidenceStatus === 'expired' && !item.outcome
    )
  ).toBe(true);
});
