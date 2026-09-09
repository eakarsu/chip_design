/** @jest-environment node */
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.CHIP_DB_PATH = ':memory:';
const storageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'chip-commercial-'));
process.env.CHIP_OBJECT_STORAGE_ROOT = storageRoot;

import type { EdaIdentity } from '@/lib/eda/identity';
import {
  createApproval,
  createArtifact,
  createFeatureRecord,
  createPpaSnapshot,
  createRtlImpact,
  decideAiReview,
  decideApproval,
  projectReviewContext,
  saveDecisionBrief,
  workspaceBundle,
} from '@/lib/commercial/store';
import {
  createOperationRecord,
  operationsBundle,
  projectSignoffMatrix,
  updateOperationRecord,
} from '@/lib/operations/store';

const admin: EdaIdentity = { tenantId: 'commercial-test-a', userId: 'admin-a', role: 'admin' };
const reviewer: EdaIdentity = { tenantId: 'commercial-test-a', userId: 'reviewer-a', role: 'admin' };
const otherTenant: EdaIdentity = { tenantId: 'commercial-test-b', userId: 'admin-b', role: 'admin' };

afterAll(() => fs.rmSync(storageRoot, { recursive: true, force: true }));

describe('commercial chip-design workspace', () => {
  it('seeds every commercial workflow and isolates tenants', async () => {
    const first = await workspaceBundle(admin);
    expect(first.projects).toHaveLength(1);
    expect(first.constraints).toHaveLength(1);
    expect(first.corners).toHaveLength(3);
    expect(first.ppaSnapshots).toHaveLength(3);
    expect(first.rtlImpacts).toHaveLength(1);
    expect(first.ecos).toHaveLength(1);
    expect(first.featureRecords.map((record) => record.feature).sort()).toEqual([
      'co-design',
      'library-marketplace',
      'spice-regression',
    ]);
    const second = await workspaceBundle(otherTenant);
    expect(second.projects[0].tenantId).toBe(otherTenant.tenantId);
    expect(second.projects[0].id).not.toBe(first.projects[0].id);
  });

  it('calculates PPA regressions and RTL impact risk from measured deltas', async () => {
    const projectId = (await workspaceBundle(admin)).projects[0].id;
    const snapshotInput = {
      projectId,
      commitSha: 'abcdef123',
      branch: 'main',
      message: 'Wide multiplier experiment',
      author: 'Test Engineer',
      areaUm2: 930000,
      powerMw: 230,
      wnsNs: -0.2,
      tnsNs: -25,
      drcCount: 20,
      congestionPct: 83,
      thresholds: { areaPct: 3, powerPct: 5, wnsNs: -0.03, drc: 2, congestionPct: 5 },
      evidence: ['runs/abcdef123/metrics.json'],
    };
    const snapshot = await createPpaSnapshot(admin, snapshotInput, 'request-ppa');
    expect(snapshot.status).toBe('regression');
    expect(snapshot.deltas.powerPct).toBeGreaterThan(5);
    const repeatedSnapshot = await createPpaSnapshot(admin, snapshotInput, 'request-ppa-repeat');
    expect(repeatedSnapshot.id).toBe(snapshot.id);
    expect(
      (await workspaceBundle(admin)).ppaSnapshots.filter((item) => item.commitSha === snapshotInput.commitSha)
    ).toHaveLength(1);
    const impact = await createRtlImpact(
      admin,
      {
        projectId,
        baseSha: 'f40ab91',
        targetSha: 'abcdef123',
        changedModules: ['mac_array'],
        timingDeltaNs: -0.2,
        powerDeltaPct: 12,
        congestionDeltaPct: 18,
        drcDelta: 18,
        affectedPaths: ['mac_array/U1/Q -> accumulator/U2/D'],
        evidence: ['git/diff/f40ab91..abcdef123'],
      },
      'request-impact'
    );
    expect(impact.risk).toBe('critical');
  });

  it('stores checksum-addressed evidence and enforces independent approval', async () => {
    const projectId = (await workspaceBundle(admin)).projects[0].id;
    const stored = await createArtifact(
      admin,
      {
        projectId,
        runRef: 'run-test',
        kind: 'timing',
        name: 'timing.rpt',
        content: 'slack -0.042',
        metadata: { corner: 'ss' },
      },
      'request-artifact'
    );
    expect(stored.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(fs.existsSync(path.join(storageRoot, stored.objectKey))).toBe(true);
    const requested = await createApproval(
      admin,
      {
        projectId,
        targetType: 'artifact',
        targetId: stored.id,
        rationale: 'Independent evidence review is required before release.',
      },
      'request-approval'
    );
    await expect(
      decideApproval(admin, requested.id, 'approved', 'Self approval must be rejected by the control.', 'self-decision')
    ).rejects.toThrow(/Independent reviewer/);
    const approved = await decideApproval(
      reviewer,
      requested.id,
      'approved',
      'Checksum, provenance and report contents were independently verified.',
      'reviewer-decision'
    );
    expect(approved.status).toBe('approved');
    expect(approved.decidedBy).toBe(reviewer.userId);
  });

  it('persists the new lifecycle capability records in the tenant evidence chain', async () => {
    const projectId = (await workspaceBundle(admin)).projects[0].id;
    const record = await createFeatureRecord(
      admin,
      {
        projectId,
        feature: 'verification-closure',
        recordType: 'coverage',
        title: 'Atlas functional coverage closure',
        status: 'active',
        payload: {
          owner: 'verification-lead',
          metricSummary: 'Functional coverage 96.2%; two reviewed holes remain.',
          lifecyclePhases: ['verification'],
        },
        evidence: ['verification/run-42/coverage-summary.rpt'],
      },
      'capability-record'
    );
    expect(record.feature).toBe('verification-closure');
    expect((await workspaceBundle(admin)).featureRecords.find((item) => item.id === record.id)).toMatchObject({
      projectId,
      recordType: 'coverage',
      status: 'active',
    });
    expect((await workspaceBundle(otherTenant)).featureRecords.find((item) => item.id === record.id)).toBeUndefined();
  });

  it('grounds AI review context by tenant and records an accountable human decision', async () => {
    const projectId = (await workspaceBundle(admin)).projects[0].id;
    const context = await projectReviewContext(admin, projectId, 'ppa');
    expect(context.project).toMatchObject({ id: projectId, name: 'Atlas NPU' });
    expect(context.activeCorners).toHaveLength(3);
    expect(Array.isArray(context.ppaHistory)).toBe(true);
    await expect(projectReviewContext(otherTenant, projectId, 'ppa')).rejects.toThrow(/not found for this tenant/i);

    const saved = await saveDecisionBrief(
      admin,
      {
        projectId,
        feature: 'ppa',
        headline: 'Hold the commit pending comparable corner evidence',
        executiveSummary:
          'The measured regression is material, but the supplied evidence does not prove that baseline and target runs used equivalent constraints and analysis corners.',
        risk: 'high',
        confidence: 91,
        verdict: 'hold',
        signoffPosition:
          'Do not advance this commit until the same MMMC set and tool configuration are rerun and independently reviewed.',
        reviewMode: 'two-pass',
        promptVersion: 'test-v2',
        evidenceQuality: {
          grade: 'B',
          score: 78,
          rationale: 'Primary reports are named, but run-equivalence provenance is incomplete.',
        },
        findings: [
          {
            severity: 'high',
            domain: 'STA',
            finding: 'WNS regressed beyond the configured guardrail.',
            impact: 'The target does not meet the declared timing acceptance threshold.',
            evidenceRefs: ['runs/test/timing.rpt'],
          },
        ],
        cornerCoverage: {
          covered: ['ss_0p72v_125c'],
          missing: ['ff_0p88v_m40c'],
          assessment: 'Only one active implementation corner is tied to the submitted record.',
        },
        metrics: [{ label: 'WNS', value: '-0.124 ns' }],
        sections: [
          { title: 'Comparability', detail: 'Confirm identical tool, PDK, SDC, RC and activity assumptions.' },
          { title: 'Attribution', detail: 'Use controlled runs before attributing the regression to one RTL block.' },
        ],
        tradeoffs: ['Extra pipeline stages may recover timing while adding latency and clock power.'],
        recommendedExperiments: ['Repeat baseline and target across the complete active corner set.'],
        stopConditions: ['Stop release if any signoff corner remains below the configured WNS threshold.'],
        dataGaps: ['Tool and constraint digests are absent.'],
        actions: ['Run a controlled, configuration-identical comparison.'],
        evidence: ['runs/test/timing.rpt'],
        assumptions: ['Submitted units are nanoseconds.'],
        humanReviewGates: ['STA owner verifies run equivalence and path-group coverage.'],
        provider: 'OpenRouter',
        model: 'test-model · specialist + challenger',
        humanStatus: 'pending',
      },
      'ai-save'
    );
    expect(saved.requestedBy).toBe(admin.userId);
    await expect(
      decideAiReview(
        admin,
        saved.id!,
        'accepted',
        'The requester must not be able to approve the AI review they initiated.',
        'ai-self-decision'
      )
    ).rejects.toThrow(/Independent reviewer/);
    const decided = await decideAiReview(
      reviewer,
      saved.id!,
      'accepted',
      'I verified the named timing report, active corners, and mandatory rerun gate.',
      'ai-decision'
    );
    expect(decided.humanStatus).toBe('accepted');
    expect(decided.humanDecision?.decidedBy).toBe(reviewer.userId);
    await expect(
      decideAiReview(
        reviewer,
        saved.id!,
        'rejected',
        'A decided AI review must remain immutable and cannot be overwritten.',
        'ai-repeat-decision'
      )
    ).rejects.toThrow(/already decided/);
  });

  it('persists tenant-bound operations and requires approved waiver activation', async () => {
    const projectId = (await workspaceBundle(admin)).projects[0].id;
    const waiver = await createOperationRecord(
      admin,
      {
        projectId,
        category: 'waiver',
        kind: 'signoff-waiver',
        title: 'DRC · M1.MIN.SPACE',
        status: 'pending-approval',
        ownerId: 'physical-design-owner',
        dueAt: '2099-12-31T23:59:59.000Z',
        payload: { domain: 'drc', rule: 'M1.MIN.SPACE', scope: 'one analog keep-out marker', rationale: 'Reviewed bounded exception for the analog keep-out marker.' },
        evidence: ['runs/test/drc-marker-14.rpt'],
      },
      'operation-create'
    );
    await expect(
      updateOperationRecord(reviewer, { id: waiver.id, status: 'approved' }, 'operation-premature')
    ).rejects.toThrow(/approved independent waiver decision/);
    const approval = await createApproval(
      admin,
      {
        projectId,
        targetType: 'waiver',
        targetId: waiver.id,
        rationale: 'Independent review is required for this bounded DRC exception.',
      },
      'operation-approval'
    );
    await decideApproval(
      reviewer,
      approval.id,
      'approved',
      'The marker, scope, evidence, owner, and expiration were independently checked.',
      'operation-decision'
    );
    const activated = await updateOperationRecord(
      reviewer,
      { id: waiver.id, status: 'approved' },
      'operation-activate'
    );
    expect(activated.status).toBe('approved');
    expect((await operationsBundle(admin, projectId)).summary.waiver).toBe(1);
    expect((await operationsBundle(otherTenant)).records.find((item) => item.id === waiver.id)).toBeUndefined();
    const matrix = await projectSignoffMatrix(admin, projectId);
    expect(matrix.activeCorners).toBe(3);
    expect(matrix.checks.find((check) => check.key === 'drc')?.state).toBe('missing');
  });
});
