/** @jest-environment node */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { getRawDb } from '@/lib/db/connection';
import type { EdaIdentity } from '@/lib/eda/identity';
import {
  approveJob,
  claimNextJob,
  completeJob,
  createJob,
  createProject,
  failJob,
  getJob,
  jobWorkspace,
  listAudit,
  listJobs,
  listProjects,
  requestCancellation,
  recoverStaleJobs,
  purgeExpired,
  verifyAuditChain,
} from '@/lib/eda/store';
import { buildDockerInvocation } from '@/lib/eda/worker';

const tenantA: EdaIdentity = { tenantId: 'tenant-a', userId: 'alice', role: 'admin' };
const tenantB: EdaIdentity = { tenantId: 'tenant-b', userId: 'bob', role: 'admin' };
const editor: EdaIdentity = { tenantId: 'tenant-a', userId: 'ed', role: 'editor' };
let temporaryDirectory: string;

beforeAll(() => {
  temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'chip-eda-test-'));
  process.env.CHIP_DB_PATH = path.join(temporaryDirectory, 'test.sqlite3');
  process.env.CHIP_EDA_OBJECT_DIR = path.join(temporaryDirectory, 'objects');
  process.env.CHIP_YOSYS_IMAGE = `registry.test/yosys@sha256:${'a'.repeat(64)}`;
  process.env.CHIP_OPENROAD_IMAGE = `registry.test/openroad@sha256:${'b'.repeat(64)}`;
});

afterAll(() => {
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
});

function project(identity = tenantA, name = 'reference') {
  return createProject(identity, {
    name, pdkRef: 'approved-pdk-v1', pdkDigest: 'c'.repeat(64), licenseRef: 'contract-42',
  });
}

function yosysJob(projectId: string, key: string, identity = tenantA, expectedCpuSeconds = 30) {
  return createJob(identity, {
    projectId, kind: 'yosys', idempotencyKey: key, expectedCpuSeconds,
    inputs: {
      'flow.ys': 'read_verilog /input/design.v\nhierarchy -top top\nwrite_json /output/netlist.json\n',
      'design.v': 'module top(input a, output y); assign y = a; endmodule\n',
    },
  });
}

describe('durable governed EDA jobs', () => {
  it('isolates projects/jobs by tenant and detects idempotency conflicts', () => {
    const firstProject = project();
    project(tenantB);
    expect(listProjects(tenantA)).toHaveLength(1);
    expect(listProjects(tenantB)).toHaveLength(1);

    const first = yosysJob(firstProject.id, 'request-0001');
    const replay = yosysJob(firstProject.id, 'request-0001');
    expect(replay.id).toBe(first.id);
    expect(getJob(tenantB, first.id)).toBeUndefined();
    expect(listJobs(tenantB)).toEqual([]);
    expect(() => createJob(tenantA, {
      projectId: firstProject.id, kind: 'yosys', idempotencyKey: 'request-0001',
      inputs: { 'flow.ys': 'changed', 'design.v': 'changed' },
    })).toThrow(/idempotency key conflicts/);
  });

  it('requires independent admin approval for expensive work', () => {
    const firstProject = listProjects(tenantA)[0];
    const expensive = yosysJob(firstProject.id, 'request-expensive', editor, 601);
    expect(expensive.status).toBe('awaiting_approval');
    expect(() => approveJob(editor, expensive.id)).toThrow(/admin approval/);
    const approved = approveJob(tenantA, expensive.id);
    expect(approved.status).toBe('queued');
    expect(approved.approvedBy).toBe('alice');
    expect(requestCancellation(tenantA, expensive.id).status).toBe('cancelled');
  });

  it('claims atomically and builds a pinned, networkless, read-only container invocation', () => {
    const claimed = claimNextJob('worker-one');
    expect(claimed?.status).toBe('running');
    expect(claimed?.attempts).toBe(1);
    const invocation = buildDockerInvocation(claimed!);
    expect(invocation.command).toBe('docker');
    expect(invocation.args).toEqual(expect.arrayContaining([
      '--network=none', '--read-only', '--cap-drop=ALL',
      '--security-opt=no-new-privileges:true', '--pids-limit=512',
    ]));
    expect(invocation.args.join(' ')).toContain('@sha256:');

    fs.writeFileSync(path.join(jobWorkspace(claimed!), 'output', 'netlist.json'), '{}', { mode: 0o600 });
    const complete = completeJob(claimed!.id, 'worker-one', { cells: 1 });
    expect(complete.status).toBe('succeeded');
    expect(complete.resultManifest?.artifacts).toHaveLength(1);
  });

  it('persists retry and cancellation states without treating work as successful', () => {
    const firstProject = listProjects(tenantA)[0];
    const retryJob = yosysJob(firstProject.id, 'request-retry');
    const claimed = claimNextJob('worker-two');
    expect(claimed?.id).toBe(retryJob.id);
    expect(failJob(retryJob.id, 'worker-two', 'transient provider failure').status).toBe('retry');
    getRawDb().prepare('UPDATE eda_jobs SET next_attempt_at=? WHERE id=?')
      .run(new Date(0).toISOString(), retryJob.id);
    const reclaimed = claimNextJob('worker-three');
    expect(reclaimed?.attempts).toBe(2);
    requestCancellation(tenantA, retryJob.id);
    expect(failJob(retryJob.id, 'worker-three', 'cancelled', false).status).toBe('cancelled');
  });

  it('finishes cancellation when the running worker loses its lease', () => {
    const job = yosysJob(listProjects(tenantA)[0].id, 'cancel-after-worker-crash');
    expect(claimNextJob('crashed-worker')?.id).toBe(job.id);
    requestCancellation(tenantA, job.id);
    getRawDb().prepare('UPDATE eda_jobs SET lease_until = ? WHERE id = ?').run('2000-01-01T00:00:00.000Z', job.id);
    recoverStaleJobs();
    expect(getJob(tenantA, job.id)).toMatchObject({ status: 'cancelled', cancelRequested: true });
    expect(claimNextJob('replacement-worker')).toBeUndefined();
    expect(listAudit(tenantA).some((event) => event.action === 'job.cancelled' && event.job_id === job.id)).toBe(true);
  });

  it('maintains a verifiable append-only audit chain', () => {
    expect(listAudit(tenantA).length).toBeGreaterThan(5);
    expect(verifyAuditChain(tenantA)).toBe(true);
    expect(() => getRawDb().prepare(
      "UPDATE eda_audit_events SET action='tampered' WHERE tenant_id=?",
    ).run(tenantA.tenantId)).toThrow(/append-only/);
  });

  it('retains terminal failure diagnostics without marking a failed tool successful', () => {
    const job = yosysJob(listProjects(tenantA)[0].id, 'terminal-failure-report');
    const claimed = claimNextJob('failure-worker')!;
    expect(claimed.id).toBe(job.id);
    fs.writeFileSync(path.join(jobWorkspace(claimed), 'output', 'worker.log'), 'syntax error at design.v:4');
    const failed = failJob(job.id, 'failure-worker', 'compiler rejected source', false);
    expect(failed.status).toBe('failed');
    expect(failed.resultManifest?.artifacts).toEqual([expect.objectContaining({ relativePath: 'worker.log' })]);
  });

  it('purges cancelled jobs once even without results, and preserves unfinished jobs', () => {
    const projectId = listProjects(tenantA)[0].id;
    const cancelled = yosysJob(projectId, 'cancelled-before-retention');
    const queued = yosysJob(projectId, 'queued-through-retention');
    requestCancellation(tenantA, cancelled.id);
    for (const job of [cancelled, queued])
      getRawDb().prepare('UPDATE eda_jobs SET retention_until=? WHERE id=?').run('2000-01-01', job.id);
    expect(purgeExpired()).toBe(1);
    expect(purgeExpired()).toBe(0);
    expect(fs.existsSync(jobWorkspace(cancelled))).toBe(false);
    expect(fs.existsSync(jobWorkspace(queued))).toBe(true);
    expect(getJob(tenantA, queued.id)).toMatchObject({ status: 'queued', artifactsExpiredAt: undefined });
    expect(listAudit(tenantA).filter((event) => event.job_id === cancelled.id && event.action === 'job.artifacts-expired')).toHaveLength(1);
    expect(verifyAuditChain(tenantA)).toBe(true);
  });
});
