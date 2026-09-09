import { createHash, randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import type Database from 'better-sqlite3';
import { getRawDb } from '@/lib/db/connection';
import type { EdaIdentity } from './identity';

export type EdaJobKind = 'yosys' | 'openroad';
export type EdaJobStatus =
  | 'awaiting_approval' | 'queued' | 'running' | 'retry'
  | 'succeeded' | 'failed' | 'cancelled';

export interface EdaProject {
  id: string;
  tenantId: string;
  name: string;
  pdkRef: string;
  pdkDigest: string;
  licenseRef: string;
  createdBy: string;
  createdAt: string;
}

export interface EdaJob {
  id: string;
  tenantId: string;
  projectId: string;
  userId: string;
  kind: EdaJobKind;
  status: EdaJobStatus;
  idempotencyKey: string;
  requestHash: string;
  inputManifest: Record<string, unknown>;
  toolImage: string;
  pdkDigest: string;
  expectedCpuSeconds: number;
  attempts: number;
  maxAttempts: number;
  progress: number;
  cancelRequested: boolean;
  leaseOwner?: string;
  leaseUntil?: string;
  approvedBy?: string;
  resultManifest?: Record<string, unknown>;
  error?: string;
  retentionUntil: string;
  createdAt: string;
  updatedAt: string;
}

type JobRow = {
  id: string; tenant_id: string; project_id: string; user_id: string;
  kind: EdaJobKind; status: EdaJobStatus; idempotency_key: string;
  request_hash: string; input_manifest_json: string; tool_image: string;
  pdk_digest: string; expected_cpu_seconds: number; attempts: number;
  max_attempts: number; progress: number; cancel_requested: number;
  lease_owner: string | null; lease_until: string | null;
  approved_by: string | null; result_manifest_json: string | null;
  error: string | null; retention_until: string; created_at: string; updated_at: string;
};

const MAX_INPUT_BYTES = Number(process.env.CHIP_MAX_JOB_INPUT_BYTES ?? 25 * 1024 * 1024);
const MAX_OUTPUT_BYTES = Number(process.env.CHIP_MAX_JOB_OUTPUT_BYTES ?? 250 * 1024 * 1024);

function database(): Database.Database {
  const db = getRawDb();
  if (process.env.NODE_ENV === 'production' && process.env.CHIP_ALLOW_SCHEMA_MIGRATION !== 'true') {
    validateEdaSchema(db);
  } else {
    ensureEdaSchema(db);
  }
  return db;
}

export function ensureEdaSchema(db: Database.Database = getRawDb()): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS eda_projects (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      pdk_ref TEXT NOT NULL,
      pdk_digest TEXT NOT NULL,
      license_ref TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(tenant_id, name)
    );
    CREATE INDEX IF NOT EXISTS idx_eda_projects_tenant ON eda_projects(tenant_id);

    CREATE TABLE IF NOT EXISTS eda_jobs (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      kind TEXT NOT NULL CHECK(kind IN ('yosys','openroad')),
      status TEXT NOT NULL,
      idempotency_key TEXT NOT NULL,
      request_hash TEXT NOT NULL,
      input_manifest_json TEXT NOT NULL,
      tool_image TEXT NOT NULL,
      pdk_digest TEXT NOT NULL,
      expected_cpu_seconds INTEGER NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 3,
      progress INTEGER NOT NULL DEFAULT 0,
      cancel_requested INTEGER NOT NULL DEFAULT 0,
      lease_owner TEXT,
      lease_until TEXT,
      next_attempt_at TEXT NOT NULL,
      approved_by TEXT,
      result_manifest_json TEXT,
      error TEXT,
      retention_until TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(project_id) REFERENCES eda_projects(id),
      UNIQUE(tenant_id, user_id, idempotency_key)
    );
    CREATE INDEX IF NOT EXISTS idx_eda_jobs_claim
      ON eda_jobs(status, next_attempt_at, created_at);
    CREATE INDEX IF NOT EXISTS idx_eda_jobs_tenant_project
      ON eda_jobs(tenant_id, project_id, created_at);

    CREATE TABLE IF NOT EXISTS eda_artifacts (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      tenant_id TEXT NOT NULL,
      relative_path TEXT NOT NULL,
      kind TEXT NOT NULL,
      sha256 TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(job_id) REFERENCES eda_jobs(id),
      UNIQUE(job_id, relative_path)
    );

    CREATE TABLE IF NOT EXISTS eda_audit_events (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id TEXT NOT NULL,
      job_id TEXT,
      actor_id TEXT NOT NULL,
      action TEXT NOT NULL,
      details_json TEXT NOT NULL,
      previous_hash TEXT NOT NULL,
      event_hash TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_eda_audit_tenant
      ON eda_audit_events(tenant_id, sequence);
    CREATE TRIGGER IF NOT EXISTS eda_audit_no_update
      BEFORE UPDATE ON eda_audit_events BEGIN
        SELECT RAISE(ABORT, 'eda audit is append-only');
      END;
    CREATE TRIGGER IF NOT EXISTS eda_audit_no_delete
      BEFORE DELETE ON eda_audit_events BEGIN
        SELECT RAISE(ABORT, 'eda audit is append-only');
      END;
  `);
}

export function validateEdaSchema(db: Database.Database = getRawDb()): void {
  const required = ['eda_projects', 'eda_jobs', 'eda_artifacts', 'eda_audit_events'];
  const existing = new Set((db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table'",
  ).all() as Array<{ name: string }>).map(row => row.name));
  const missing = required.filter(table => !existing.has(table));
  if (missing.length) throw new Error(`EDA migration required; missing: ${missing.join(', ')}`);
}

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function appendAudit(
  db: Database.Database,
  identity: Pick<EdaIdentity, 'tenantId' | 'userId'>,
  action: string,
  jobId: string | null,
  details: Record<string, unknown>,
): void {
  const createdAt = new Date().toISOString();
  const previous = db.prepare(
    'SELECT event_hash FROM eda_audit_events WHERE tenant_id=? ORDER BY sequence DESC LIMIT 1',
  ).get(identity.tenantId) as { event_hash: string } | undefined;
  const previousHash = previous?.event_hash ?? '0'.repeat(64);
  const detailsJson = canonical(details);
  const eventHash = sha256([
    previousHash, identity.tenantId, jobId ?? '', identity.userId,
    action, detailsJson, createdAt,
  ].join('|'));
  db.prepare(`
    INSERT INTO eda_audit_events
      (tenant_id, job_id, actor_id, action, details_json, previous_hash, event_hash, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(identity.tenantId, jobId, identity.userId, action, detailsJson, previousHash, eventHash, createdAt);
}

function projectFromRow(row: Record<string, unknown>): EdaProject {
  return {
    id: String(row.id), tenantId: String(row.tenant_id), name: String(row.name),
    pdkRef: String(row.pdk_ref), pdkDigest: String(row.pdk_digest),
    licenseRef: String(row.license_ref), createdBy: String(row.created_by),
    createdAt: String(row.created_at),
  };
}

function jobFromRow(row: JobRow): EdaJob {
  return {
    id: row.id, tenantId: row.tenant_id, projectId: row.project_id,
    userId: row.user_id, kind: row.kind, status: row.status,
    idempotencyKey: row.idempotency_key, requestHash: row.request_hash,
    inputManifest: JSON.parse(row.input_manifest_json) as Record<string, unknown>,
    toolImage: row.tool_image, pdkDigest: row.pdk_digest,
    expectedCpuSeconds: row.expected_cpu_seconds, attempts: row.attempts,
    maxAttempts: row.max_attempts, progress: row.progress,
    cancelRequested: !!row.cancel_requested,
    leaseOwner: row.lease_owner ?? undefined, leaseUntil: row.lease_until ?? undefined,
    approvedBy: row.approved_by ?? undefined,
    resultManifest: row.result_manifest_json
      ? JSON.parse(row.result_manifest_json) as Record<string, unknown> : undefined,
    error: row.error ?? undefined, retentionUntil: row.retention_until,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

function requireDigest(value: string, label: string): string {
  if (!/^[0-9a-f]{64}$/.test(value)) throw new Error(`${label} must be a lowercase SHA-256 digest`);
  return value;
}

function pinnedImage(kind: EdaJobKind): string {
  const image = process.env[kind === 'yosys' ? 'CHIP_YOSYS_IMAGE' : 'CHIP_OPENROAD_IMAGE'] ?? '';
  if (!/^[a-zA-Z0-9./:_-]+@sha256:[0-9a-f]{64}$/.test(image)) {
    throw new Error(`${kind} image must be pinned by sha256 digest`);
  }
  return image;
}

export function createProject(
  identity: EdaIdentity,
  input: { name: string; pdkRef: string; pdkDigest: string; licenseRef: string },
): EdaProject {
  if (!input.name.trim() || input.name.length > 120) throw new Error('invalid project name');
  if (!input.pdkRef.trim() || !input.licenseRef.trim()) throw new Error('PDK and license references are required');
  const db = database();
  const project: EdaProject = {
    id: randomUUID(), tenantId: identity.tenantId, name: input.name.trim(),
    pdkRef: input.pdkRef.trim(), pdkDigest: requireDigest(input.pdkDigest, 'PDK'),
    licenseRef: input.licenseRef.trim(), createdBy: identity.userId,
    createdAt: new Date().toISOString(),
  };
  db.transaction(() => {
    db.prepare(`
      INSERT INTO eda_projects
        (id, tenant_id, name, pdk_ref, pdk_digest, license_ref, created_by, created_at)
      VALUES (@id, @tenantId, @name, @pdkRef, @pdkDigest, @licenseRef, @createdBy, @createdAt)
    `).run(project);
    appendAudit(db, identity, 'project.created', null, {
      projectId: project.id, pdkDigest: project.pdkDigest,
    });
  })();
  return project;
}

export function listProjects(identity: EdaIdentity): EdaProject[] {
  return database().prepare(
    'SELECT * FROM eda_projects WHERE tenant_id=? ORDER BY created_at DESC',
  ).all(identity.tenantId).map(row => projectFromRow(row as Record<string, unknown>));
}

function storageRoot(): string {
  return path.resolve(process.env.CHIP_EDA_OBJECT_DIR ?? path.join(process.cwd(), 'data', 'eda-objects'));
}

export function jobWorkspace(job: Pick<EdaJob, 'id' | 'tenantId' | 'projectId'>): string {
  for (const value of [job.id, job.tenantId, job.projectId]) {
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(value)) throw new Error('unsafe workspace identifier');
  }
  return path.join(storageRoot(), job.tenantId, job.projectId, job.id);
}

function validateInputs(inputs: Record<string, string>): Array<{ name: string; sha256: string; size: number }> {
  const entries = Object.entries(inputs);
  if (entries.length < 1 || entries.length > 64) throw new Error('between 1 and 64 inputs are required');
  let total = 0;
  return entries.sort(([left], [right]) => left.localeCompare(right)).map(([name, content]) => {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/.test(name) || name.includes('..')) {
      throw new Error(`unsafe input filename: ${name}`);
    }
    const bytes = Buffer.from(content, 'utf8');
    total += bytes.length;
    if (total > MAX_INPUT_BYTES) throw new Error('job inputs exceed configured limit');
    return { name, sha256: sha256(bytes), size: bytes.length };
  });
}

export function createJob(
  identity: EdaIdentity,
  input: {
    projectId: string; kind: EdaJobKind; idempotencyKey: string;
    inputs: Record<string, string>; expectedCpuSeconds?: number; retentionDays?: number;
  },
): EdaJob {
  if (!/^[a-zA-Z0-9._:-]{8,128}$/.test(input.idempotencyKey)) throw new Error('invalid idempotency key');
  const expectedCpuSeconds = Math.max(1, Math.min(input.expectedCpuSeconds ?? 300, 86_400));
  const retentionDays = Math.max(1, Math.min(input.retentionDays ?? 30, 365));
  const db = database();
  const projectRow = db.prepare(
    'SELECT * FROM eda_projects WHERE id=? AND tenant_id=?',
  ).get(input.projectId, identity.tenantId) as Record<string, unknown> | undefined;
  if (!projectRow) throw new Error('project not found');
  const project = projectFromRow(projectRow);
  const fileManifest = validateInputs(input.inputs);
  const requiredScript = input.kind === 'yosys' ? 'flow.ys' : 'flow.tcl';
  if (!(requiredScript in input.inputs)) throw new Error(`${requiredScript} is required`);
  const toolImage = pinnedImage(input.kind);
  const requestDocument = {
    projectId: project.id, kind: input.kind, files: fileManifest,
    expectedCpuSeconds, pdkDigest: project.pdkDigest, toolImage,
  };
  const requestHash = sha256(canonical(requestDocument));
  const existing = db.prepare(
    'SELECT * FROM eda_jobs WHERE tenant_id=? AND user_id=? AND idempotency_key=?',
  ).get(identity.tenantId, identity.userId, input.idempotencyKey) as JobRow | undefined;
  if (existing) {
    if (existing.request_hash !== requestHash) throw new Error('idempotency key conflicts with another request');
    return jobFromRow(existing);
  }

  const now = new Date();
  const job: EdaJob = {
    id: randomUUID(), tenantId: identity.tenantId, projectId: project.id,
    userId: identity.userId, kind: input.kind,
    status: expectedCpuSeconds > 600 ? 'awaiting_approval' : 'queued',
    idempotencyKey: input.idempotencyKey, requestHash,
    inputManifest: requestDocument, toolImage, pdkDigest: project.pdkDigest,
    expectedCpuSeconds, attempts: 0, maxAttempts: 3, progress: 0,
    cancelRequested: false,
    retentionUntil: new Date(now.getTime() + retentionDays * 86_400_000).toISOString(),
    createdAt: now.toISOString(), updatedAt: now.toISOString(),
  };
  const workspace = jobWorkspace(job);
  const inputDir = path.join(workspace, 'input');
  fs.mkdirSync(inputDir, { recursive: true, mode: 0o700 });
  fs.mkdirSync(path.join(workspace, 'output'), { recursive: true, mode: 0o700 });
  try {
    for (const [name, content] of Object.entries(input.inputs)) {
      fs.writeFileSync(path.join(inputDir, name), content, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    }
    fs.writeFileSync(path.join(workspace, 'input-manifest.json'), canonical(requestDocument), {
      encoding: 'utf8', mode: 0o600, flag: 'wx',
    });
    db.transaction(() => {
      db.prepare(`
        INSERT INTO eda_jobs
          (id, tenant_id, project_id, user_id, kind, status, idempotency_key,
           request_hash, input_manifest_json, tool_image, pdk_digest,
           expected_cpu_seconds, attempts, max_attempts, progress, cancel_requested,
           next_attempt_at, retention_until, created_at, updated_at)
        VALUES
          (@id, @tenantId, @projectId, @userId, @kind, @status, @idempotencyKey,
           @requestHash, @inputManifestJson, @toolImage, @pdkDigest,
           @expectedCpuSeconds, @attempts, @maxAttempts, @progress, 0,
           @createdAt, @retentionUntil, @createdAt, @updatedAt)
      `).run({ ...job, inputManifestJson: canonical(job.inputManifest) });
      appendAudit(db, identity, 'job.created', job.id, {
        projectId: job.projectId, kind: job.kind, requestHash, status: job.status,
      });
    })();
  } catch (error) {
    fs.rmSync(workspace, { recursive: true, force: true });
    throw error;
  }
  return job;
}

export function getJob(identity: Pick<EdaIdentity, 'tenantId'>, id: string): EdaJob | undefined {
  const row = database().prepare('SELECT * FROM eda_jobs WHERE id=? AND tenant_id=?')
    .get(id, identity.tenantId) as JobRow | undefined;
  return row ? jobFromRow(row) : undefined;
}

export function listJobs(identity: Pick<EdaIdentity, 'tenantId'>, projectId?: string): EdaJob[] {
  const rows = projectId
    ? database().prepare('SELECT * FROM eda_jobs WHERE tenant_id=? AND project_id=? ORDER BY created_at DESC')
      .all(identity.tenantId, projectId)
    : database().prepare('SELECT * FROM eda_jobs WHERE tenant_id=? ORDER BY created_at DESC')
      .all(identity.tenantId);
  return rows.map(row => jobFromRow(row as JobRow));
}

export function approveJob(identity: EdaIdentity, id: string): EdaJob {
  if (identity.role !== 'admin') throw new Error('admin approval required');
  const db = database();
  db.transaction(() => {
    const pending = db.prepare(
      "SELECT user_id FROM eda_jobs WHERE id=? AND tenant_id=? AND status='awaiting_approval'",
    ).get(id, identity.tenantId) as { user_id: string } | undefined;
    if (!pending) throw new Error('job is not awaiting approval');
    if (pending.user_id === identity.userId) throw new Error('submitter cannot approve their own expensive job');
    const result = db.prepare(`
      UPDATE eda_jobs SET status='queued', approved_by=?, updated_at=?
      WHERE id=? AND tenant_id=? AND status='awaiting_approval'
    `).run(identity.userId, new Date().toISOString(), id, identity.tenantId);
    if (!result.changes) throw new Error('job is not awaiting approval');
    appendAudit(db, identity, 'job.approved', id, {});
  })();
  return getJob(identity, id)!;
}

export function requestCancellation(identity: EdaIdentity, id: string): EdaJob {
  const db = database();
  db.transaction(() => {
    const job = db.prepare('SELECT * FROM eda_jobs WHERE id=? AND tenant_id=?')
      .get(id, identity.tenantId) as JobRow | undefined;
    if (!job) throw new Error('job not found');
    if (identity.role === 'viewer' || (job.user_id !== identity.userId && identity.role !== 'admin')) {
      throw new Error('job cancellation is not permitted');
    }
    if (['succeeded', 'failed', 'cancelled'].includes(job.status)) return;
    const status = ['queued', 'retry', 'awaiting_approval'].includes(job.status) ? 'cancelled' : job.status;
    db.prepare('UPDATE eda_jobs SET cancel_requested=1, status=?, updated_at=? WHERE id=?')
      .run(status, new Date().toISOString(), id);
    appendAudit(db, identity, 'job.cancellation-requested', id, { previousStatus: job.status });
  })();
  return getJob(identity, id)!;
}

export function recoverStaleJobs(now = new Date()): number {
  const db = database();
  const stale = db.prepare(`
    SELECT * FROM eda_jobs WHERE status='running' AND lease_until < ?
  `).all(now.toISOString()) as JobRow[];
  let recovered = 0;
  for (const job of stale) {
    db.transaction(() => {
      const current = db.prepare("SELECT * FROM eda_jobs WHERE id = ? AND status = 'running' AND lease_until < ?").get(job.id, now.toISOString()) as JobRow | undefined;
      if (!current) return;
      const exhausted = current.attempts >= current.max_attempts;
      const status = current.cancel_requested ? 'cancelled' : exhausted ? 'failed' : 'retry';
      const updated = db.prepare(`
        UPDATE eda_jobs SET status=?, lease_owner=NULL, lease_until=NULL,
          next_attempt_at=?, error=?, updated_at=? WHERE id=? AND status='running' AND lease_until < ?
      `).run(
        status, now.toISOString(), current.cancel_requested ? 'cancelled after worker lease expired' : 'worker lease expired',
        now.toISOString(), job.id, now.toISOString(),
      );
      if (!updated.changes) return;
      recovered++;
      appendAudit(db, { tenantId: job.tenant_id, userId: 'system' },
        status === 'retry' ? 'job.recovered' : `job.${status}`, job.id, { attempts: current.attempts });
    }).immediate();
  }
  return recovered;
}

export function claimNextJob(workerId: string, leaseSeconds = 60): EdaJob | undefined {
  if (!/^[a-zA-Z0-9._:-]{3,160}$/.test(workerId)) throw new Error('invalid worker id');
  recoverStaleJobs();
  const db = database();
  const claim = db.transaction(() => {
    const now = new Date();
    const row = db.prepare(`
      SELECT * FROM eda_jobs
      WHERE status IN ('queued','retry') AND cancel_requested=0 AND next_attempt_at <= ?
      ORDER BY created_at LIMIT 1
    `).get(now.toISOString()) as JobRow | undefined;
    if (!row) return undefined;
    const leaseUntil = new Date(now.getTime() + leaseSeconds * 1000).toISOString();
    const result = db.prepare(`
      UPDATE eda_jobs SET status='running', attempts=attempts+1, lease_owner=?,
        lease_until=?, progress=1, error=NULL, updated_at=?
      WHERE id=? AND status IN ('queued','retry')
    `).run(workerId, leaseUntil, now.toISOString(), row.id);
    if (!result.changes) return undefined;
    appendAudit(db, { tenantId: row.tenant_id, userId: workerId }, 'job.claimed', row.id, {
      leaseUntil, attempt: row.attempts + 1,
    });
    return db.prepare('SELECT * FROM eda_jobs WHERE id=?').get(row.id) as JobRow;
  });
  const row = claim.immediate();
  return row ? jobFromRow(row) : undefined;
}

export function renewLease(jobId: string, workerId: string, progress: number, leaseSeconds = 60): boolean {
  const now = new Date();
  const result = database().prepare(`
    UPDATE eda_jobs SET lease_until=?, progress=?, updated_at=?
    WHERE id=? AND status='running' AND lease_owner=?
  `).run(
    new Date(now.getTime() + leaseSeconds * 1000).toISOString(),
    Math.max(1, Math.min(Math.floor(progress), 99)), now.toISOString(), jobId, workerId,
  );
  return !!result.changes;
}

function collectArtifacts(outputDir: string): Array<{ id: string; relativePath: string; sha256: string; size: number }> {
  const artifacts: Array<{ id: string; relativePath: string; sha256: string; size: number }> = [];
  let total = 0;
  const walk = (directory: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      const relativePath = path.relative(outputDir, absolute);
      if (entry.isSymbolicLink()) throw new Error('symbolic-link artifacts are forbidden');
      if (entry.isDirectory()) walk(absolute);
      else if (entry.isFile()) {
        const content = fs.readFileSync(absolute);
        total += content.length;
        if (total > MAX_OUTPUT_BYTES) throw new Error('job output exceeds configured limit');
        artifacts.push({ id: randomUUID(), relativePath, sha256: sha256(content), size: content.length });
      }
    }
  };
  walk(outputDir);
  return artifacts.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

export function completeJob(jobId: string, workerId: string, metrics: Record<string, number>): EdaJob {
  const db = database();
  const row = db.prepare('SELECT * FROM eda_jobs WHERE id=? AND status=\'running\' AND lease_owner=?')
    .get(jobId, workerId) as JobRow | undefined;
  if (!row) throw new Error('worker does not own running job');
  const job = jobFromRow(row);
  const artifacts = collectArtifacts(path.join(jobWorkspace(job), 'output'));
  const resultManifest = {
    requestHash: job.requestHash, toolImage: job.toolImage, pdkDigest: job.pdkDigest,
    metrics, artifacts,
  };
  const now = new Date().toISOString();
  db.transaction(() => {
    db.prepare(`
      UPDATE eda_jobs SET status='succeeded', progress=100, lease_owner=NULL,
        lease_until=NULL, result_manifest_json=?, updated_at=? WHERE id=?
    `).run(canonical(resultManifest), now, jobId);
    const insert = db.prepare(`
      INSERT INTO eda_artifacts
        (id, job_id, tenant_id, relative_path, kind, sha256, size_bytes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const artifact of artifacts) {
      insert.run(artifact.id, jobId, job.tenantId, artifact.relativePath,
        path.extname(artifact.relativePath).slice(1) || 'file', artifact.sha256, artifact.size, now);
    }
    appendAudit(db, { tenantId: job.tenantId, userId: workerId }, 'job.succeeded', jobId, {
      artifacts: artifacts.length, resultHash: sha256(canonical(resultManifest)),
    });
  })();
  return getJob({ tenantId: job.tenantId }, jobId)!;
}

export function failJob(jobId: string, workerId: string, message: string, retryable = true): EdaJob {
  const db = database();
  const row = db.prepare('SELECT * FROM eda_jobs WHERE id=? AND status=\'running\' AND lease_owner=?')
    .get(jobId, workerId) as JobRow | undefined;
  if (!row) throw new Error('worker does not own running job');
  const retry = retryable && !row.cancel_requested && row.attempts < row.max_attempts;
  const status: EdaJobStatus = row.cancel_requested ? 'cancelled' : retry ? 'retry' : 'failed';
  const now = new Date();
  const delaySeconds = retry ? Math.min(300, 2 ** row.attempts) : 0;
  db.transaction(() => {
    db.prepare(`
      UPDATE eda_jobs SET status=?, lease_owner=NULL, lease_until=NULL,
        next_attempt_at=?, error=?, updated_at=? WHERE id=?
    `).run(status, new Date(now.getTime() + delaySeconds * 1000).toISOString(),
      message.slice(-2000), now.toISOString(), jobId);
    appendAudit(db, { tenantId: row.tenant_id, userId: workerId }, `job.${status}`, jobId, {
      attempt: row.attempts, retryable: retry,
    });
  })();
  return getJob({ tenantId: row.tenant_id }, jobId)!;
}

export function readArtifact(identity: Pick<EdaIdentity, 'tenantId'>, jobId: string, artifactId: string): {
  path: string; sha256: string; size: number;
} | undefined {
  const db = database();
  const row = db.prepare(`
    SELECT a.relative_path, a.sha256, a.size_bytes, j.project_id
    FROM eda_artifacts a JOIN eda_jobs j ON j.id=a.job_id
    WHERE a.id=? AND a.job_id=? AND a.tenant_id=? AND j.tenant_id=?
  `).get(artifactId, jobId, identity.tenantId, identity.tenantId) as {
    relative_path: string; sha256: string; size_bytes: number; project_id: string;
  } | undefined;
  if (!row) return undefined;
  const absolute = path.join(jobWorkspace({ id: jobId, tenantId: identity.tenantId, projectId: row.project_id }),
    'output', row.relative_path);
  const outputRoot = path.join(storageRoot(), identity.tenantId, row.project_id, jobId, 'output') + path.sep;
  if (!absolute.startsWith(outputRoot)) throw new Error('unsafe artifact path');
  return { path: absolute, sha256: row.sha256, size: row.size_bytes };
}

export function listAudit(identity: Pick<EdaIdentity, 'tenantId'>): Array<Record<string, unknown>> {
  return database().prepare(`
    SELECT sequence, job_id, actor_id, action, details_json, previous_hash, event_hash, created_at
    FROM eda_audit_events WHERE tenant_id=? ORDER BY sequence
  `).all(identity.tenantId).map(row => {
    const item = row as Record<string, unknown>;
    return { ...item, details: JSON.parse(String(item.details_json)), details_json: undefined };
  });
}

export function verifyAuditChain(identity: Pick<EdaIdentity, 'tenantId'>): boolean {
  let previousHash = '0'.repeat(64);
  for (const raw of database().prepare(
    'SELECT * FROM eda_audit_events WHERE tenant_id=? ORDER BY sequence',
  ).all(identity.tenantId) as Array<Record<string, unknown>>) {
    if (raw.previous_hash !== previousHash) return false;
    const expected = sha256([
      previousHash, identity.tenantId, raw.job_id ?? '', raw.actor_id,
      raw.action, raw.details_json, raw.created_at,
    ].join('|'));
    if (raw.event_hash !== expected) return false;
    previousHash = String(raw.event_hash);
  }
  return true;
}

export function purgeExpired(now = new Date()): number {
  const db = database();
  const expired = db.prepare(`
    SELECT * FROM eda_jobs WHERE retention_until < ? AND status IN ('succeeded','failed','cancelled')
  `).all(now.toISOString()) as JobRow[];
  for (const row of expired) {
    const job = jobFromRow(row);
    fs.rmSync(jobWorkspace(job), { recursive: true, force: true });
    db.transaction(() => {
      db.prepare('DELETE FROM eda_artifacts WHERE job_id=?').run(job.id);
      db.prepare('UPDATE eda_jobs SET result_manifest_json=NULL, updated_at=? WHERE id=?')
        .run(now.toISOString(), job.id);
      appendAudit(db, { tenantId: job.tenantId, userId: 'retention-sweeper' },
        'job.artifacts-expired', job.id, {});
    })();
  }
  return expired.length;
}
