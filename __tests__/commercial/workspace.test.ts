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
  createPpaSnapshot,
  createRtlImpact,
  decideApproval,
  workspaceBundle,
} from '@/lib/commercial/store';

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
    expect(first.featureRecords.map(record => record.feature).sort()).toEqual(['co-design', 'library-marketplace', 'spice-regression']);
    const second = await workspaceBundle(otherTenant);
    expect(second.projects[0].tenantId).toBe(otherTenant.tenantId);
    expect(second.projects[0].id).not.toBe(first.projects[0].id);
  });

  it('calculates PPA regressions and RTL impact risk from measured deltas', async () => {
    const projectId = (await workspaceBundle(admin)).projects[0].id;
    const snapshot = await createPpaSnapshot(admin, {
      projectId, commitSha: 'abcdef123', branch: 'main', message: 'Wide multiplier experiment', author: 'Test Engineer',
      areaUm2: 930000, powerMw: 230, wnsNs: -0.2, tnsNs: -25, drcCount: 20, congestionPct: 83,
      thresholds: { areaPct: 3, powerPct: 5, wnsNs: -0.03, drc: 2, congestionPct: 5 },
      evidence: ['runs/abcdef123/metrics.json'],
    }, 'request-ppa');
    expect(snapshot.status).toBe('regression');
    expect(snapshot.deltas.powerPct).toBeGreaterThan(5);
    const impact = await createRtlImpact(admin, {
      projectId, baseSha: 'f40ab91', targetSha: 'abcdef123', changedModules: ['mac_array'],
      timingDeltaNs: -0.2, powerDeltaPct: 12, congestionDeltaPct: 18, drcDelta: 18,
      affectedPaths: ['mac_array/U1/Q -> accumulator/U2/D'], evidence: ['git/diff/f40ab91..abcdef123'],
    }, 'request-impact');
    expect(impact.risk).toBe('critical');
  });

  it('stores checksum-addressed evidence and enforces independent approval', async () => {
    const projectId = (await workspaceBundle(admin)).projects[0].id;
    const stored = await createArtifact(admin, { projectId, runRef: 'run-test', kind: 'timing', name: 'timing.rpt', content: 'slack -0.042', metadata: { corner: 'ss' } }, 'request-artifact');
    expect(stored.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(fs.existsSync(path.join(storageRoot, stored.objectKey))).toBe(true);
    const requested = await createApproval(admin, { projectId, targetType: 'artifact', targetId: stored.id, rationale: 'Independent evidence review is required before release.' }, 'request-approval');
    await expect(decideApproval(admin, requested.id, 'approved', 'Self approval must be rejected by the control.', 'self-decision')).rejects.toThrow(/Independent reviewer/);
    const approved = await decideApproval(reviewer, requested.id, 'approved', 'Checksum, provenance and report contents were independently verified.', 'reviewer-decision');
    expect(approved.status).toBe('approved');
    expect(approved.decidedBy).toBe(reviewer.userId);
  });
});
