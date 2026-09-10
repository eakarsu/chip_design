/** @jest-environment node */
process.env.CHIP_DB_PATH = ':memory:';

import fs from 'fs';
import os from 'os';
import path from 'path';
import { generateKeyPairSync } from 'crypto';
import {
  createApproval,
  createArtifact,
  createConstraint,
  createCorner,
  createFeatureRecord,
  createPpaSnapshot,
  createWorkspaceProject,
  decideApproval,
} from '@/lib/commercial/store';
import { executeCapabilityAction } from '@/lib/commercial/capabilityExecution';
import { verifyReleasePrerequisites } from '@/lib/commercial/release';
import { projectSignoffMatrix } from '@/lib/operations/store';
import type { EdaIdentity } from '@/lib/eda/identity';

const author: EdaIdentity = { tenantId: 'release-candidate', userId: 'author', role: 'editor' };
const reviewer: EdaIdentity = { ...author, userId: 'reviewer', role: 'admin' };
const rationale = 'Independent review of a test fixture for candidate binding.';
let root: string;
beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'release-candidate-'));
  process.env.CHIP_OBJECT_STORAGE_ROOT = root;
  process.env.CHIP_OBJECT_STORAGE_BUCKET = '';
  const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
  process.env.CHIP_RELEASE_SIGNING_PRIVATE_KEY_BASE64 = Buffer.from(
    keys.privateKey.export({ type: 'pkcs8', format: 'pem' })
  ).toString('base64');
  process.env.CHIP_RELEASE_SIGNING_PUBLIC_KEY_BASE64 = Buffer.from(
    keys.publicKey.export({ type: 'spki', format: 'pem' })
  ).toString('base64');
  process.env.CHIP_RELEASE_SIGNING_KEY_ID = 'candidate-test';
});
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

it('holds the complete signoff matrix and release ceremony until the current commit has its own approval', async () => {
  const { id: projectId } = await createWorkspaceProject(
    author,
    {
      name: 'Candidate binding',
      description: 'Test fixture',
      repositoryUrl: '',
      defaultBranch: 'main',
      topModule: 'gcd',
      pdkRef: 'fixture',
      status: 'active',
    },
    'project'
  );
  const approve = async (targetType: string, targetId: string) => {
    const request = await createApproval(author, { projectId, targetType, targetId, rationale }, 'request');
    await decideApproval(reviewer, request.id, 'approved', rationale, 'decision');
  };
  const sign = async (commitSha: string) => {
    const execution = await executeCapabilityAction({
      identity: author,
      projectId,
      capabilityId: 'tapeout-release',
      actionId: 'signed-manifest',
      input: {
        release: commitSha,
        commitSha,
        artifacts: [{ name: 'chip.gds', sha256: 'a'.repeat(64), sizeBytes: 100 }],
      },
    });
    return createFeatureRecord(
      author,
      {
        projectId,
        feature: 'tapeout-release',
        recordType: 'signed-manifest',
        title: commitSha,
        status: execution.status,
        payload: { execution },
        evidence: ['fixture.json'],
      },
      'sign',
      'execution'
    );
  };
  const ceremony = (manifestRecordId: string) =>
    executeCapabilityAction({
      identity: author,
      projectId,
      capabilityId: 'tapeout-release',
      actionId: 'release-ceremony',
      input: { manifestRecordId },
    });
  const snapshot = (commitSha: string) =>
    createPpaSnapshot(
      author,
      {
        projectId,
        commitSha,
        branch: 'main',
        message: 'Fixture',
        author: author.userId,
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

  const old = await sign('aaaaaaaaaa');
  await approve('signoff', old.id);
  expect(await verifyReleasePrerequisites(author, projectId, old.id)).toMatchObject({
    ready: false,
    signatureVerified: true,
    candidateMatches: false,
  });
  await snapshot('aaaaaaaaaa');
  expect((await ceremony(old.id)).status).toBe('completed');
  await snapshot('bbbbbbbbbb');
  const constraint = await createConstraint(
    author,
    { projectId, name: 'current', sdc: 'create_clock -period 10 [get_ports clk]' },
    'constraint'
  );
  for (const name of ['ss', 'tt', 'ff'])
    await createCorner(
      author,
      {
        projectId,
        constraintSetId: constraint.id,
        name,
        process: name,
        voltage: 1,
        temperature: 25,
        libertyRef: 'fixture',
        rcCorner: 'fixture',
        active: true,
      },
      'corner'
    );
  for (const domain of ['sta', 'drc', 'lvs', 'ir', 'em', 'antenna', 'cdc']) {
    const report = {
      schemaVersion: 1,
      domain,
      runRef: domain,
      commitSha: 'bbbbbbbbbb',
      constraintSetId: constraint.id,
      corners: ['ss', 'tt', 'ff'],
      tool: { product: 'fixture', version: '1', licenseRef: 'fixture' },
      completedAt: new Date().toISOString(),
      checks: [{ rule: 'fixture', scope: 'fixture', observed: 0, limit: 0, comparison: 'lte' }],
    };
    const artifact = await createArtifact(
      author,
      {
        projectId,
        runRef: domain,
        kind: domain,
        name: `${domain}.json`,
        content: JSON.stringify(report),
        metadata: {},
      },
      'artifact'
    );
    await approve('artifact', artifact.id);
  }
  const stale = await projectSignoffMatrix(author, projectId);
  expect(stale.decision).toBe('hold');
  expect(stale.checks.filter((check) => check.key !== 'approval').every((check) => check.state === 'pass')).toBe(true);
  expect(stale.checks.find((check) => check.key === 'approval')?.blockers.join(' ')).toMatch(
    /commit.*current candidate/
  );
  expect((await ceremony(old.id)).status).toBe('blocked');
  const current = await sign('bbbbbbbbbb');
  expect((await projectSignoffMatrix(author, projectId)).decision).toBe('hold');
  await approve('signoff', current.id);
  expect((await projectSignoffMatrix(author, projectId)).decision).toBe('ready');
  expect((await ceremony(current.id)).status).toBe('completed');
});
