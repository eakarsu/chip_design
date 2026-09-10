/** @jest-environment node */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { generateKeyPairSync, randomUUID } from 'crypto';
import { all, commercialTransaction, one, run } from '@/lib/commercial/database';
import {
  createApproval,
  createArtifact,
  createConstraint,
  createCorner,
  createEco,
  createFeatureRecord,
  createPpaSnapshot,
  createWorkspaceProject,
  decideAiReview,
  decideApproval,
  saveDecisionBrief,
  workspaceBundle,
} from '@/lib/commercial/store';
import {
  createOperationRecord,
  ingestSpiceResults,
  listOperationRecords,
  projectSignoffMatrix,
  updateOperationRecord,
} from '@/lib/operations/store';
import {
  AI_DESIGN_WORKFLOWS,
  aiDesignFeature,
  aiDesignStepRecordType,
  assessAiDesignWorkflows,
} from '@/lib/commercial/aiDesignWorkflows';
import { executeCapabilityAction } from '@/lib/commercial/capabilityExecution';
import { verifyReleasePrerequisites } from '@/lib/commercial/release';
import type { EdaIdentity } from '@/lib/eda/identity';
import type { DecisionBrief } from '@/lib/commercial/types';
import type { SignoffReport } from '@/lib/operations/signoff';
import { claimNextJob, completeJob, createProject as createEdaProject } from '@/lib/eda/store';
import { getRawDb } from '@/lib/db/connection';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chip-governance-regressions-'));
process.env.CHIP_DB_PATH = ':memory:';
process.env.CHIP_OBJECT_STORAGE_ROOT = root;
process.env.CHIP_OBJECT_STORAGE_BUCKET = '';
process.env.ALLOW_DEMO_SEED = 'false';
process.env.CHIP_ALLOW_COMMERCIAL_DEMO_SEED = 'false';
const editor: EdaIdentity = { tenantId: 'regression-tenant', userId: 'author', role: 'editor' };
const reviewer: EdaIdentity = { ...editor, userId: 'reviewer', role: 'admin' };
const otherTenant: EdaIdentity = { ...reviewer, tenantId: 'other-tenant' };
const rationale = 'Primary evidence and exact scope were independently reviewed.';

afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

async function project() {
  return createWorkspaceProject(
    editor,
    {
      name: randomUUID(),
      description: 'Regression fixture',
      repositoryUrl: 'https://example.test/design',
      defaultBranch: 'main',
      topModule: 'top',
      pdkRef: 'test-pdk',
      status: 'active',
    },
    'project'
  );
}

async function approve(projectId: string, targetType: string, targetId: string) {
  const request = await createApproval(editor, { projectId, targetType, targetId, rationale }, 'approval');
  return decideApproval(reviewer, request.id, 'approved', rationale, 'decision');
}

function brief(projectId: string, feature: string): Omit<DecisionBrief, 'id' | 'createdAt'> {
  return {
    projectId,
    feature,
    headline: 'Evidence review',
    executiveSummary: rationale,
    risk: 'low',
    confidence: 90,
    verdict: 'proceed',
    signoffPosition: 'Human review required',
    reviewMode: 'two-pass',
    promptVersion: 'test',
    evidenceQuality: { grade: 'A', score: 90, rationale },
    findings: [],
    cornerCoverage: { covered: ['tt'], missing: [], assessment: rationale },
    metrics: [],
    sections: [],
    tradeoffs: [],
    recommendedExperiments: [],
    stopConditions: [],
    dataGaps: [],
    actions: [],
    evidence: ['report.json'],
    assumptions: [],
    humanReviewGates: ['independent review'],
    provider: 'test',
    model: 'fixture',
    humanStatus: 'pending',
  };
}

describe('constraint and ECO transactions', () => {
  it('allocates distinct constraint versions concurrently and keeps exactly one active version', async () => {
    const { id: projectId } = await project();
    const input = { projectId, name: 'functional', sdc: 'create_clock -period 10 [get_ports clk]' };
    const saved = await Promise.all(
      Array.from({ length: 8 }, (_, index) => createConstraint(editor, input, `constraint-${index}`))
    );
    expect(saved.map((item) => item.version).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    const active = await all('SELECT * FROM commercial_constraint_sets WHERE project_id = ? AND active = 1', [
      projectId,
    ]);
    expect(active).toHaveLength(1);
    expect(active[0].version).toBe(8);
    await expect(
      run('UPDATE commercial_constraint_sets SET active = 1 WHERE project_id = ?', [projectId])
    ).rejects.toMatchObject({ code: 'SQLITE_CONSTRAINT_UNIQUE' });
    await run('UPDATE commercial_constraint_sets SET version = 20 WHERE id = ?', [active[0].id]);
    expect((await createConstraint(editor, input, 'after-gap')).version).toBe(21);
  });

  it('rolls back a failed transaction and permits a later save', async () => {
    const { id: projectId } = await project();
    const first = await createConstraint(editor, { projectId, name: 'first', sdc: 'clock' }, 'first');
    await expect(
      commercialTransaction(async () => {
        await run('UPDATE commercial_constraint_sets SET active = 0 WHERE id = ?', [first.id]);
        throw new Error('rollback fixture');
      })
    ).rejects.toThrow('rollback fixture');
    expect((await one('SELECT active FROM commercial_constraint_sets WHERE id = ?', [first.id]))?.active).toBe(1);
    expect(
      (await createConstraint(editor, { projectId, name: 'first', sdc: 'changed' }, 'after-rollback')).version
    ).toBe(2);
  });

  it.each(['approved', 'rejected'] as const)(
    'links the ECO request and records the %s decision atomically',
    async (decision) => {
      const { id: projectId } = await project();
      const eco = await createEco(
        editor,
        {
          projectId,
          title: 'Timing ECO',
          baselineSha: 'aaaaaaa',
          targetSha: 'bbbbbbb',
          objective: rationale,
          patch: '+ buffer',
          beforeMetrics: { wnsNs: -0.1 },
          afterMetrics: { wnsNs: 0.1 },
        },
        'eco'
      );
      const input = { projectId, targetType: 'eco', targetId: eco.id, rationale };
      const requests = await Promise.all([
        createApproval(editor, input, 'first'),
        createApproval(editor, input, 'replay'),
      ]);
      expect(requests[0].id).toBe(requests[1].id);
      expect(await one('SELECT status, approval_id FROM commercial_ecos WHERE id = ?', [eco.id])).toMatchObject({
        status: 'review',
        approval_id: requests[0].id,
      });
      await decideApproval(reviewer, requests[0].id, decision, rationale, 'eco-decision');
      expect(await one('SELECT status, approval_id FROM commercial_ecos WHERE id = ?', [eco.id])).toMatchObject({
        status: decision,
        approval_id: requests[0].id,
      });
      await expect(decideApproval(reviewer, requests[0].id, 'approved', rationale, 'repeat')).rejects.toThrow(
        /already decided/
      );
      const anotherProject = await project();
      await expect(createApproval(editor, { ...input, projectId: anotherProject.id }, 'wrong-project')).rejects.toThrow(
        /target not found/i
      );
      await expect(createApproval(otherTenant, input, 'wrong-tenant')).rejects.toThrow(/not found/i);
    }
  );
});

describe('signoff evidence and bounded waivers', () => {
  async function fixture() {
    const { id: projectId } = await project();
    const constraint = await createConstraint(editor, { projectId, name: 'functional', sdc: 'clock' }, 'constraint');
    for (const name of ['ss', 'tt', 'ff'])
      await createCorner(
        editor,
        {
          projectId,
          constraintSetId: constraint.id,
          name,
          process: name,
          voltage: 1,
          temperature: 25,
          libertyRef: 'lib',
          rcCorner: 'rc',
          active: true,
        },
        'corner'
      );
    await createPpaSnapshot(
      editor,
      {
        projectId,
        commitSha: 'abcdef123',
        branch: 'main',
        message: 'Candidate',
        author: editor.userId,
        areaUm2: 10,
        powerMw: 10,
        wnsNs: 0.1,
        tnsNs: 0,
        drcCount: 0,
        congestionPct: 1,
        thresholds: {},
        evidence: ['metrics.json'],
      },
      'ppa'
    );
    const report: SignoffReport = {
      schemaVersion: 1,
      domain: 'drc',
      runRef: 'run-1',
      commitSha: 'abcdef123',
      constraintSetId: constraint.id,
      corners: ['ss', 'tt', 'ff'],
      tool: { product: 'test-drc', version: '1', licenseRef: 'licensed-run' },
      completedAt: new Date().toISOString(),
      checks: [{ rule: 'M1.SPACE', scope: 'analog/marker-1', observed: 0, limit: 0, comparison: 'lte' }],
    };
    return { projectId, report };
  }
  async function upload(projectId: string, report: SignoffReport, reviewed = true) {
    const artifact = await createArtifact(
      editor,
      {
        projectId,
        kind: report.domain,
        runRef: report.runRef,
        name: `${randomUUID()}.json`,
        content: JSON.stringify(report),
        metadata: { passed: true },
      },
      'artifact'
    );
    if (reviewed) await approve(projectId, 'artifact', artifact.id);
    return artifact;
  }
  async function drc(projectId: string) {
    return (await projectSignoffMatrix(editor, projectId)).checks.find((check) => check.key === 'drc')!;
  }
  function waiverInput(projectId: string) {
    return {
      projectId,
      category: 'waiver' as const,
      kind: 'signoff-waiver',
      title: 'Bounded marker exception',
      status: 'pending-approval',
      dueAt: '2099-01-01T00:00:00.000Z',
      payload: { domain: 'drc', rule: 'M1.SPACE', scope: 'analog/marker-1', rationale },
      evidence: ['reviewed-marker.json'],
    };
  }

  it('checks report bytes and numeric results instead of names or passed metadata', async () => {
    const { projectId, report } = await fixture();
    const misleading = await createArtifact(
      editor,
      {
        projectId,
        kind: 'drc',
        runRef: 'failed',
        name: 'clean-drc.rpt',
        content: 'FAIL: 37 violations',
        metadata: { passed: true },
      },
      'fake-report'
    );
    // Make the older fixture unambiguous even when both writes share a millisecond.
    await run('UPDATE commercial_artifacts SET created_at = ? WHERE id = ?', [
      '2000-01-01T00:00:00.000Z',
      misleading.id,
    ]);
    expect((await drc(projectId)).state).toBe('attention');
    const artifact = await upload(projectId, report, false);
    expect((await drc(projectId)).state).toBe('attention');
    await approve(projectId, 'artifact', artifact.id);
    expect((await drc(projectId)).state).toBe('pass');
    fs.writeFileSync(path.join(root, artifact.objectKey), '{}');
    expect((await drc(projectId)).blockers.join(' ')).toMatch(/checksum/);
    report.checks[0].observed = 37;
    await upload(projectId, report);
    expect((await drc(projectId)).state).toBe('attention');
    expect((await projectSignoffMatrix(editor, projectId)).decision).toBe('hold');
  });

  it.each(['commit', 'constraint', 'corners'] as const)('rejects stale or incomplete %s provenance', async (field) => {
    const { projectId, report } = await fixture();
    report.domain = 'sta';
    if (field === 'commit') report.commitSha = '0000000';
    if (field === 'constraint') report.constraintSetId = randomUUID();
    if (field === 'corners') report.corners = ['ss'];
    await upload(projectId, report);
    expect((await projectSignoffMatrix(editor, projectId)).checks.find((check) => check.key === 'sta')?.state).toBe(
      'attention'
    );
  });

  it('requires evidence, a future expiry and an independent approval before waiver activation', async () => {
    const { projectId } = await fixture();
    const input = waiverInput(projectId);
    await expect(createOperationRecord(editor, { ...input, status: 'active' }, 'bypass')).rejects.toThrow(
      /await independent approval/
    );
    await expect(createOperationRecord(editor, { ...input, dueAt: undefined }, 'no-expiry')).rejects.toThrow(
      /expiration/
    );
    await expect(createOperationRecord(editor, { ...input, evidence: [] }, 'no-evidence')).rejects.toThrow(/evidence/);
    const waiver = await createOperationRecord(editor, input, 'waiver');
    const approvals = await all('SELECT id FROM commercial_approvals WHERE target_id = ?', [waiver.id]);
    expect(approvals).toHaveLength(1);
    await expect(updateOperationRecord(editor, { id: waiver.id, status: 'active' }, 'self')).rejects.toThrow(
      /independent admin/
    );
    await expect(updateOperationRecord(reviewer, { id: waiver.id, status: 'active' }, 'premature')).rejects.toThrow(
      /approved independent/
    );
    await decideApproval(reviewer, String(approvals[0].id), 'approved', rationale, 'approve-waiver');
    await updateOperationRecord(reviewer, { id: waiver.id, status: 'active' }, 'activate');
    await expect(
      updateOperationRecord(reviewer, { id: waiver.id, payload: { scope: '*' } }, 'broaden')
    ).rejects.toThrow(/immutable/);
    expect((await drc(projectId)).state).toBe('missing');
  });

  it('applies a waiver only to its exact failing rule and scope, and stops honoring it at expiry', async () => {
    const { projectId, report } = await fixture();
    report.checks[0].observed = 1;
    await upload(projectId, report);
    const waiver = await createOperationRecord(editor, waiverInput(projectId), 'waiver');
    await approve(projectId, 'waiver', waiver.id);
    await updateOperationRecord(reviewer, { id: waiver.id, status: 'active' }, 'activate');
    expect((await drc(projectId)).state).toBe('waived');
    report.checks.push({ ...report.checks[0], scope: 'digital/marker-2' });
    await upload(projectId, report);
    expect((await drc(projectId)).state).toBe('attention');
    await run('UPDATE commercial_operation_records SET due_at = ? WHERE id = ?', [
      '2000-01-01T00:00:00.000Z',
      waiver.id,
    ]);
    expect((await drc(projectId)).blockers).toHaveLength(2);
  });
});

describe('SPICE matrix ingestion', () => {
  const point = (pointId: string, status: 'passed' | 'failed' = 'passed') => ({
    pointId,
    status,
    measurements: { delay: 1 },
    worstGoldenDeltaPct: status === 'failed' ? 9 : 0,
    waveformRef: `${pointId}.raw`,
    sha256: 'a'.repeat(64),
  });
  async function suiteFixture() {
    const { id: projectId } = await project();
    const suite = await createOperationRecord(
      editor,
      {
        projectId,
        category: 'spice',
        kind: 'pvt-matrix',
        title: 'Three points',
        status: 'queued',
        payload: { totalPoints: 3, matrix: ['p1', 'p2', 'p3'].map((id) => ({ id, status: 'queued' })) },
      },
      'suite'
    );
    return { projectId, suiteId: suite.id };
  }
  it('accumulates partial and concurrent batches and passes only the complete suite', async () => {
    const ids = await suiteFixture();
    const first = await ingestSpiceResults(editor, { ...ids, results: [point('p1')] }, 'partial');
    expect(first.suite.status).toBe('running');
    expect(first.summary).toMatchObject({ completed: 1, remaining: 2 });
    await Promise.all(['p2', 'p3'].map((id) => ingestSpiceResults(editor, { ...ids, results: [point(id)] }, id)));
    const suite = (await listOperationRecords(editor, { projectId: ids.projectId })).find(
      (item) => item.id === ids.suiteId
    )!;
    expect(suite.status).toBe('passed');
    expect(suite.payload.completedPoints).toBe(3);
    expect(suite.payload.pointResults).toHaveLength(3);
    const before = (await listOperationRecords(editor, { projectId: ids.projectId })).length;
    expect((await ingestSpiceResults(editor, { ...ids, results: [point('p1')] }, 'replay')).replayed).toBe(true);
    expect(await listOperationRecords(editor, { projectId: ids.projectId })).toHaveLength(before);
  });
  it('preserves earlier failures and rejects conflicting, duplicate, unknown and foreign points atomically', async () => {
    const ids = await suiteFixture();
    await ingestSpiceResults(editor, { ...ids, results: [point('p1', 'failed')] }, 'failure');
    const second = await ingestSpiceResults(editor, { ...ids, results: [point('p2')] }, 'success');
    expect(second.suite.status).toBe('attention');
    expect(second.summary).toMatchObject({ failed: 1, completed: 2, worstGoldenDeltaPct: 9 });
    for (const results of [[point('p3'), point('unknown')], [point('p3'), point('p3')], [point('p1')]]) {
      await expect(ingestSpiceResults(editor, { ...ids, results }, 'invalid')).rejects.toThrow();
    }
    const foreign = await project();
    await expect(
      ingestSpiceResults(editor, { ...ids, projectId: foreign.id, results: [point('p3')] }, 'wrong-project')
    ).rejects.toThrow(/not found/);
    await expect(updateOperationRecord(editor, { id: ids.suiteId, status: 'passed' }, 'bypass')).rejects.toThrow(
      /ingestion/
    );
    const suite = (await listOperationRecords(editor, { projectId: ids.projectId })).find(
      (item) => item.id === ids.suiteId
    )!;
    expect(suite.payload.completedPoints).toBe(2);
    expect(suite.payload.failedPoints).toBe(1);
  });
});

describe('workflow advancement and retained release approval', () => {
  it('requires completed worker evidence and a subsequent human review before PPA advancement', async () => {
    const { id: projectId } = await project();
    const previousImage = process.env.CHIP_YOSYS_IMAGE;
    const previousDirectory = process.env.CHIP_EDA_OBJECT_DIR;
    process.env.CHIP_YOSYS_IMAGE = `test/yosys@sha256:${'a'.repeat(64)}`;
    process.env.CHIP_EDA_OBJECT_DIR = path.join(root, 'eda');
    const workflow = AI_DESIGN_WORKFLOWS.find((item) => item.id === 'ppa-closure')!;
    const feature = aiDesignFeature(workflow.id);
    const manual = (index: number) => ({
      projectId,
      feature,
      recordType: aiDesignStepRecordType(workflow.steps[index].id),
      title: workflow.steps[index].title,
      status: 'complete',
      payload: { owner: editor.userId, summary: rationale },
      evidence: ['ppa-evidence.json'],
    });
    try {
      await createFeatureRecord(editor, manual(0), 'intent');
      await createFeatureRecord(editor, manual(1), 'evidence');
      const edaProject = createEdaProject(editor, {
        name: 'PPA replay',
        pdkRef: 'test',
        pdkDigest: 'a'.repeat(64),
        licenseRef: 'test-license',
      });
      let jobId = '';
      for (const action of workflow.steps.flatMap((step) => step.actions ?? [])) {
        const execution =
          action.actionId === 'sandbox-rerun'
            ? await executeCapabilityAction({
                identity: editor,
                ...action,
                input: {
                  edaProjectId: edaProject.id,
                  kind: 'yosys',
                  idempotencyKey: 'ppa-worker-evidence',
                  inputs: { 'flow.ys': '# fixture' },
                },
              })
            : action.actionId === 'eco-recommendations'
              ? await executeCapabilityAction({
                  identity: editor,
                  ...action,
                  input: { violations: [{ domain: 'setup', path: 'path-1' }] },
                })
              : { status: 'completed', data: {} };
        if (action.actionId === 'sandbox-rerun') jobId = (execution.data as { job: { id: string } }).job.id;
        if (action.actionId === 'eco-recommendations') expect(execution.status).toBe('completed');
        await createFeatureRecord(
          editor,
          {
            ...manual(1),
            feature: action.capabilityId,
            recordType: action.actionId,
            status: execution.status,
            payload: { execution },
          },
          'tool-result',
          'execution'
        );
      }
      const review = await saveDecisionBrief(editor, brief(projectId, feature), 'early-review');
      const decided = await decideAiReview(reviewer, review.id!, 'accepted', rationale, 'early-human');
      await expect(createFeatureRecord(editor, manual(6), 'pending-job')).rejects.toThrow(/prerequisites/);
      expect(claimNextJob('ppa-regression-worker')?.id).toBe(jobId);
      completeJob(jobId, 'ppa-regression-worker', { cells: 1 });
      const completedAt = new Date(Date.parse(decided.humanDecision!.decidedAt) + 1000).toISOString();
      getRawDb().prepare('UPDATE eda_jobs SET updated_at = ? WHERE id = ?').run(completedAt, jobId);
      const record = (await workspaceBundle(editor)).featureRecords.find(
        (item) => item.recordType === 'sandbox-rerun' && item.projectId === projectId
      )!;
      expect(record).toMatchObject({ status: 'completed', payload: { jobCompletedAt: completedAt } });
      await expect(createFeatureRecord(editor, manual(6), 'stale-worker-review')).rejects.toThrow(
        /must follow the current evidence/
      );
      const clock = jest.spyOn(Date, 'now').mockReturnValue(Date.parse(completedAt) + 1);
      try {
        const fresh = await saveDecisionBrief(editor, brief(projectId, feature), 'fresh-review');
        await decideAiReview(reviewer, fresh.id!, 'accepted', rationale, 'fresh-human');
        await expect(createFeatureRecord(editor, manual(6), 'completed-ppa')).resolves.toMatchObject({
          status: 'complete',
        });
      } finally {
        clock.mockRestore();
      }
    } finally {
      if (previousImage === undefined) delete process.env.CHIP_YOSYS_IMAGE;
      else process.env.CHIP_YOSYS_IMAGE = previousImage;
      if (previousDirectory === undefined) delete process.env.CHIP_EDA_OBJECT_DIR;
      else process.env.CHIP_EDA_OBJECT_DIR = previousDirectory;
    }
  });

  it('rejects skipped steps, forged tool records and stale evidence, while allowing a complete reviewed workflow', async () => {
    const { id: projectId } = await project();
    const workflow = AI_DESIGN_WORKFLOWS[0];
    const feature = aiDesignFeature(workflow.id);
    const manual = (index: number) => ({
      projectId,
      feature,
      recordType: aiDesignStepRecordType(workflow.steps[index].id),
      title: workflow.steps[index].title,
      status: 'complete',
      payload: { owner: editor.userId, summary: rationale },
      evidence: ['retained-evidence.json'],
    });
    await createFeatureRecord(editor, manual(0), 'start');
    await expect(createFeatureRecord(editor, manual(6), 'skip')).rejects.toThrow(/prerequisites/);
    await createFeatureRecord(editor, manual(1), 'baseline');
    const actionRecords = workflow.steps.flatMap((step) => (step.kind === 'advance' ? [] : (step.actions ?? [])));
    for (const action of actionRecords) {
      const input = { ...manual(1), feature: action.capabilityId, recordType: action.actionId, status: 'completed' };
      await expect(createFeatureRecord(editor, input, 'forge')).rejects.toThrow(/governed capability execution/);
      await createFeatureRecord(editor, input, 'worker-result', 'execution');
    }
    const review = await saveDecisionBrief(
      editor,
      {
        ...brief(projectId, feature),
        humanStatus: 'accepted',
        humanDecision: { decidedBy: reviewer.userId, decidedAt: new Date().toISOString(), rationale },
      },
      'review'
    );
    expect(review.humanStatus).toBe('pending');
    expect(review.humanDecision).toBeUndefined();
    await expect(createFeatureRecord(editor, manual(6), 'unreviewed')).rejects.toThrow(/prerequisites/);
    await decideAiReview(reviewer, review.id!, 'accepted', rationale, 'human');
    const advance = await createFeatureRecord(editor, manual(6), 'advance');
    expect(advance.payload.reviewId).toBe(review.id);
    let assessment = assessAiDesignWorkflows(await workspaceBundle(editor), projectId)[0];
    expect(assessment.steps[6].status).toBe('complete');
    await createFeatureRecord(editor, manual(1), 'changed-baseline');
    assessment = assessAiDesignWorkflows(await workspaceBundle(editor), projectId)[0];
    expect(assessment.steps[6].status).toBe('blocked');
    await expect(createFeatureRecord(editor, manual(6), 'stale-review')).rejects.toThrow(
      /must follow the current evidence/
    );
    const nextReview = await saveDecisionBrief(editor, brief(projectId, feature), 'new-review');
    await decideAiReview(reviewer, nextReview.id!, 'accepted', rationale, 'new-human');
    await expect(createFeatureRecord(editor, manual(6), 'new-advance')).resolves.toMatchObject({ status: 'complete' });
  });

  it('requires an authentic project-bound signed manifest and a persisted independent approval', async () => {
    const { id: projectId } = await project();
    await createPpaSnapshot(
      editor,
      {
        projectId,
        commitSha: 'abcdef123',
        branch: 'main',
        message: 'Release candidate',
        author: editor.userId,
        areaUm2: 10,
        powerMw: 10,
        wnsNs: 0.1,
        tnsNs: 0,
        drcCount: 0,
        congestionPct: 1,
        thresholds: {},
        evidence: ['metrics.json'],
      },
      'candidate'
    );
    const keyNames = [
      'CHIP_RELEASE_SIGNING_PRIVATE_KEY_BASE64',
      'CHIP_RELEASE_SIGNING_PUBLIC_KEY_BASE64',
      'CHIP_RELEASE_SIGNING_KEY_ID',
    ] as const;
    const previous = keyNames.map((name) => process.env[name]);
    const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
    process.env.CHIP_RELEASE_SIGNING_PRIVATE_KEY_BASE64 = Buffer.from(
      keys.privateKey.export({ type: 'pkcs8', format: 'pem' })
    ).toString('base64');
    process.env.CHIP_RELEASE_SIGNING_PUBLIC_KEY_BASE64 = Buffer.from(
      keys.publicKey.export({ type: 'spki', format: 'pem' })
    ).toString('base64');
    process.env.CHIP_RELEASE_SIGNING_KEY_ID = 'regression-signing-key';
    try {
      const workflow = AI_DESIGN_WORKFLOWS.find((item) => item.id === 'tapeout-release')!;
      const feature = aiDesignFeature(workflow.id);
      for (const step of workflow.steps.slice(0, 2)) {
        await createFeatureRecord(
          editor,
          {
            projectId,
            feature,
            recordType: aiDesignStepRecordType(step.id),
            title: step.title,
            status: 'complete',
            payload: { owner: editor.userId, summary: rationale },
            evidence: ['release-evidence.json'],
          },
          'scope'
        );
      }
      for (const actionId of ['foundry-checklist', 'pdk-deck-lock', 'gds-oasis-verify']) {
        await createFeatureRecord(
          editor,
          {
            projectId,
            feature: 'tapeout-release',
            recordType: actionId,
            title: actionId,
            status: 'completed',
            payload: {},
            evidence: ['tool-report.json'],
          },
          'tool',
          'execution'
        );
      }
      const spoof = await executeCapabilityAction({
        identity: editor,
        projectId,
        capabilityId: 'tapeout-release',
        actionId: 'release-ceremony',
        input: { approvals: [], signatureVerified: true, manifestDigest: 'a'.repeat(64) },
      });
      expect(spoof.status).toBe('blocked');
      const execution = await executeCapabilityAction({
        identity: editor,
        projectId,
        capabilityId: 'tapeout-release',
        actionId: 'signed-manifest',
        input: {
          release: 'rc1',
          commitSha: 'abcdef123',
          artifacts: [{ name: 'chip.gds', sha256: 'a'.repeat(64), sizeBytes: 100 }],
        },
      });
      const manifest = await createFeatureRecord(
        editor,
        {
          projectId,
          feature: 'tapeout-release',
          recordType: 'signed-manifest',
          title: 'Release rc1',
          status: execution.status,
          payload: { execution },
          evidence: ['manifest.json'],
        },
        'signed',
        'execution'
      );
      expect((await verifyReleasePrerequisites(editor, projectId, manifest.id)).ready).toBe(false);
      await approve(projectId, 'signoff', manifest.id);
      expect(await verifyReleasePrerequisites(editor, projectId, manifest.id)).toMatchObject({
        ready: true,
        signatureVerified: true,
        approved: 1,
      });
      expect(
        (
          await executeCapabilityAction({
            identity: editor,
            projectId,
            capabilityId: 'tapeout-release',
            actionId: 'release-ceremony',
            input: { manifestRecordId: manifest.id },
          })
        ).status
      ).toBe('completed');
      const review = await saveDecisionBrief(editor, brief(projectId, feature), 'release-review');
      await decideAiReview(reviewer, review.id!, 'accepted', rationale, 'release-human');
      const ceremonyInput = {
        projectId,
        feature: 'tapeout-release',
        recordType: 'release-ceremony',
        title: 'Release',
        status: 'completed',
        payload: { execution: { data: { manifestRecordId: manifest.id } } },
        evidence: ['release-evidence.json'],
      };
      await expect(createFeatureRecord(editor, ceremonyInput, 'ceremony', 'execution')).resolves.toMatchObject({
        status: 'completed',
      });
      const replacement = await createFeatureRecord(
        editor,
        {
          projectId,
          feature: 'tapeout-release',
          recordType: 'signed-manifest',
          title: 'New release candidate',
          status: execution.status,
          payload: { execution },
          evidence: ['new-manifest.json'],
        },
        'new-manifest',
        'execution'
      );
      const newReview = await saveDecisionBrief(editor, brief(projectId, feature), 'new-release-review');
      await decideAiReview(reviewer, newReview.id!, 'accepted', rationale, 'new-release-human');
      await expect(createFeatureRecord(editor, ceremonyInput, 'outdated-manifest', 'execution')).rejects.toThrow(
        /signed manifest in the current workflow/
      );
      expect((await verifyReleasePrerequisites(editor, projectId, replacement.id)).ready).toBe(false);
      expect((await verifyReleasePrerequisites(otherTenant, projectId, manifest.id)).ready).toBe(false);
      expect((await verifyReleasePrerequisites(editor, (await project()).id, manifest.id)).ready).toBe(false);
      const payload = structuredClone(manifest.payload) as { execution: { data: { manifest: { release: string } } } };
      payload.execution.data.manifest.release = 'tampered';
      await run('UPDATE commercial_feature_records SET payload_json = ? WHERE id = ?', [
        JSON.stringify(payload),
        manifest.id,
      ]);
      expect((await verifyReleasePrerequisites(editor, projectId, manifest.id)).ready).toBe(false);
      await run('UPDATE commercial_feature_records SET payload_json = ? WHERE id = ?', [
        JSON.stringify(manifest.payload),
        manifest.id,
      ]);
      const corruptSignature = structuredClone(manifest.payload) as { execution: { data: { signature: string } } };
      corruptSignature.execution.data.signature = Buffer.from('forged-signature').toString('base64');
      await run('UPDATE commercial_feature_records SET payload_json = ? WHERE id = ?', [
        JSON.stringify(corruptSignature),
        manifest.id,
      ]);
      expect((await verifyReleasePrerequisites(editor, projectId, manifest.id)).findings.join(' ')).toMatch(
        /signature verification failed/
      );
      await run('UPDATE commercial_feature_records SET payload_json = ? WHERE id = ?', [
        JSON.stringify(manifest.payload),
        manifest.id,
      ]);
      process.env.CHIP_RELEASE_SIGNING_KEY_ID = 'different-key';
      expect((await verifyReleasePrerequisites(editor, projectId, manifest.id)).ready).toBe(false);
    } finally {
      keyNames.forEach((name, index) => {
        if (previous[index] === undefined) delete process.env[name];
        else process.env[name] = previous[index];
      });
    }
  });
});
