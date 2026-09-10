import 'server-only';

import { createHash, randomUUID } from 'crypto';
import type { EdaIdentity } from '@/lib/eda/identity';
import { all, commercialTransaction, lockCommercialProject, one, run } from '@/lib/commercial/database';
import { createApproval } from '@/lib/commercial/store';
import { verifyReleasePrerequisites } from '@/lib/commercial/release';
import { getWorkspaceObject } from '@/lib/commercial/objectStore';
import { signoffReportSchema, signoffCheckPasses, waiverPayloadSchema } from './signoff';
import { mergeSpiceResults, spiceResultsSchema } from './spice';
import { readinessScore } from './domain';
import {
  operationCategories,
  type OperationCategory,
  type OperationRecord,
  type OperationsBundle,
  type SignoffCheck,
  type SignoffMatrix,
} from './types';

type Row = Record<string, unknown>;

function parseObject(value: unknown): Record<string, unknown> {
  try {
    const result = JSON.parse(String(value ?? '{}')) as unknown;
    return result && typeof result === 'object' && !Array.isArray(result) ? (result as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function parseList(value: unknown): string[] {
  try {
    const result = JSON.parse(String(value ?? '[]')) as unknown;
    return Array.isArray(result) ? result.filter((item) => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function record(row: Row): OperationRecord {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    projectId: row.project_id ? String(row.project_id) : undefined,
    category: String(row.category) as OperationCategory,
    kind: String(row.kind),
    title: String(row.title),
    status: String(row.status),
    ownerId: String(row.owner_id),
    parentId: row.parent_id ? String(row.parent_id) : undefined,
    payload: parseObject(row.payload_json),
    evidence: parseList(row.evidence_json),
    dueAt: row.due_at ? String(row.due_at) : undefined,
    createdBy: String(row.created_by),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

async function projectExists(identity: EdaIdentity, projectId?: string): Promise<void> {
  if (!projectId) return;
  const found = await one('SELECT id FROM commercial_projects WHERE tenant_id = ? AND id = ?', [
    identity.tenantId,
    projectId,
  ]);
  if (!found) throw new Error('Project not found for this tenant');
}

async function appendAudit(
  identity: EdaIdentity,
  action: string,
  resourceId: string,
  details: Record<string, unknown>,
  requestId: string
): Promise<void> {
  await run(
    'INSERT INTO commercial_audit_events (id, tenant_id, actor_id, action, resource, resource_id, details_json, request_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [
      randomUUID(),
      identity.tenantId,
      identity.userId,
      action,
      'operation_record',
      resourceId,
      JSON.stringify(details),
      requestId,
      new Date().toISOString(),
    ]
  );
}

export async function listOperationRecords(
  identity: EdaIdentity,
  filters: { projectId?: string; category?: OperationCategory } = {}
): Promise<OperationRecord[]> {
  const clauses = ['tenant_id = ?'];
  const values: unknown[] = [identity.tenantId];
  if (filters.projectId) {
    clauses.push('project_id = ?');
    values.push(filters.projectId);
  }
  if (filters.category) {
    clauses.push('category = ?');
    values.push(filters.category);
  }
  const rows = await all(
    `SELECT * FROM commercial_operation_records WHERE ${clauses.join(' AND ')} ORDER BY updated_at DESC`,
    values
  );
  return rows.map(record);
}

export async function operationsBundle(identity: EdaIdentity, projectId?: string): Promise<OperationsBundle> {
  await projectExists(identity, projectId);
  const records = await listOperationRecords(identity, { projectId });
  const summary = Object.fromEntries(
    operationCategories.map((category) => [category, records.filter((item) => item.category === category).length])
  ) as Record<OperationCategory, number>;
  return { records, summary };
}

export async function createOperationRecord(
  identity: EdaIdentity,
  input: {
    projectId?: string;
    category: OperationCategory;
    kind: string;
    title: string;
    status: string;
    ownerId?: string;
    parentId?: string;
    payload?: Record<string, unknown>;
    evidence?: string[];
    dueAt?: string;
  },
  requestId: string
): Promise<OperationRecord> {
  return commercialTransaction(async () => {
  if (input.projectId) await lockCommercialProject(identity.tenantId, input.projectId);
  let payload = input.payload ?? {};
  if (input.category === 'waiver') {
    if (!input.projectId) throw new Error('A project is required for a waiver');
    if (input.status !== 'pending-approval') throw new Error('New waivers must await independent approval');
    payload = waiverPayloadSchema.parse(input.payload);
    if (!input.dueAt || !Number.isFinite(Date.parse(input.dueAt)) || Date.parse(input.dueAt) <= Date.now()) throw new Error('A future waiver expiration is required');
    if (!input.evidence?.length || input.evidence.some((item) => !item.trim())) throw new Error('Waiver evidence is required');
  }
  if (input.category === 'spice' && ['pvt-matrix', 'regression-matrix'].includes(input.kind)) {
    if (input.status !== 'queued') throw new Error('New SPICE matrices must start queued');
    if (input.payload?.pointResults !== undefined) throw new Error('Submit SPICE measurements through the result-ingestion endpoint');
    payload = mergeSpiceResults(payload, []).payload;
  }
  if (input.parentId) {
    const parent = await one('SELECT id, project_id FROM commercial_operation_records WHERE tenant_id = ? AND id = ?', [
      identity.tenantId,
      input.parentId,
    ]);
    if (!parent || (input.projectId && parent.project_id !== input.projectId)) throw new Error('Parent operation record not found for this project');
  }
  const id = randomUUID();
  const timestamp = new Date().toISOString();
  await run(
    `INSERT INTO commercial_operation_records
      (id, tenant_id, project_id, category, kind, title, status, owner_id, parent_id,
       payload_json, evidence_json, due_at, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      identity.tenantId,
      input.projectId ?? null,
      input.category,
      input.kind,
      input.title,
      input.status,
      input.ownerId ?? identity.userId,
      input.parentId ?? null,
      JSON.stringify(payload),
      JSON.stringify(input.evidence ?? []),
      input.dueAt ?? null,
      identity.userId,
      timestamp,
      timestamp,
    ]
  );
  await appendAudit(
    identity,
    'create',
    id,
    { category: input.category, kind: input.kind, projectId: input.projectId },
    requestId
  );
  if (input.category === 'waiver') await createApproval(identity, {
    projectId: input.projectId!, targetType: 'waiver', targetId: id,
    rationale: String(input.payload!.rationale),
  }, requestId);
  return record(
    (await one('SELECT * FROM commercial_operation_records WHERE tenant_id = ? AND id = ?', [identity.tenantId, id]))!
  );
  });
}

export async function updateOperationRecord(
  identity: EdaIdentity,
  input: {
    id: string;
    status?: string;
    ownerId?: string;
    dueAt?: string | null;
    payload?: Record<string, unknown>;
    evidence?: string[];
  },
  requestId: string
): Promise<OperationRecord> {
  return commercialTransaction(async () => {
  const reference = await one('SELECT project_id FROM commercial_operation_records WHERE tenant_id = ? AND id = ?', [identity.tenantId, input.id]);
  if (reference?.project_id) await lockCommercialProject(identity.tenantId, String(reference.project_id));
  const currentRow = await one('SELECT * FROM commercial_operation_records WHERE tenant_id = ? AND id = ?', [
    identity.tenantId,
    input.id,
  ]);
  if (!currentRow) throw new Error('Operation record not found');
  const current = record(currentRow);
  if (identity.role !== 'admin' && current.createdBy !== identity.userId && current.ownerId !== identity.userId) {
    throw new Error('Only the owner, creator, or an admin can update this record');
  }
  if (current.category === 'waiver') {
    if (input.payload !== undefined || input.evidence !== undefined || input.dueAt !== undefined || input.ownerId !== undefined) {
      throw new Error('Waiver scope, evidence, owner and expiration are immutable; submit a new waiver for review');
    }
    if (input.status && !['approved', 'active', 'rejected', 'closed', 'revoked'].includes(input.status)) throw new Error('Invalid waiver transition');
    if (['closed', 'revoked', 'rejected'].includes(current.status)) throw new Error('Closed waivers cannot be reactivated');
  }
  if (current.category === 'spice' && ['pvt-matrix', 'regression-matrix'].includes(current.kind) &&
      (input.status !== undefined || (input.payload && ['matrix', 'totalPoints', 'pointResults', 'completedPoints', 'failedPoints', 'worstGoldenDeltaPct'].some((key) => key in input.payload!)))) {
    throw new Error('SPICE suite progress must be derived through the result-ingestion endpoint');
  }
  if (current.category === 'waiver' && input.status && ['approved', 'active'].includes(input.status)) {
    if (identity.role !== 'admin') throw new Error('Only an independent admin reviewer can activate a waiver');
    if (current.createdBy === identity.userId) throw new Error('An independent waiver reviewer is required');
    if (!current.dueAt || !Number.isFinite(Date.parse(current.dueAt)) || Date.parse(current.dueAt) <= Date.now()) throw new Error('Expired waivers cannot be activated');
    if (!current.evidence.length || current.evidence.some((item) => !item.trim())) throw new Error('Waiver evidence is required');
    waiverPayloadSchema.parse(current.payload);
    const approved = await one(
      "SELECT id FROM commercial_approvals WHERE tenant_id = ? AND project_id = ? AND target_type = 'waiver' AND target_id = ? AND status = 'approved' AND decided_by <> requested_by AND decided_by <> ?",
      [identity.tenantId, current.projectId, current.id, current.createdBy]
    );
    if (!approved) throw new Error('An approved independent waiver decision is required');
  }
  const nextPayload = input.payload ? { ...current.payload, ...input.payload } : current.payload;
  await run(
    `UPDATE commercial_operation_records SET status = ?, owner_id = ?, due_at = ?,
      payload_json = ?, evidence_json = ?, updated_at = ? WHERE tenant_id = ? AND id = ?`,
    [
      input.status ?? current.status,
      input.ownerId ?? current.ownerId,
      input.dueAt === null ? null : (input.dueAt ?? current.dueAt ?? null),
      JSON.stringify(nextPayload),
      JSON.stringify(input.evidence ?? current.evidence),
      new Date().toISOString(),
      identity.tenantId,
      input.id,
    ]
  );
  await appendAudit(identity, 'update', input.id, { status: input.status, ownerId: input.ownerId }, requestId);
  return record(
    (await one('SELECT * FROM commercial_operation_records WHERE tenant_id = ? AND id = ?', [
      identity.tenantId,
      input.id,
    ]))!
  );
  });
}

export async function ingestSpiceResults(identity: EdaIdentity, rawInput: unknown, requestId: string) {
  const input = spiceResultsSchema.parse(rawInput);
  return commercialTransaction(async () => {
    await lockCommercialProject(identity.tenantId, input.projectId);
    const row = await one("SELECT * FROM commercial_operation_records WHERE tenant_id = ? AND project_id = ? AND id = ? AND category = 'spice'", [identity.tenantId, input.projectId, input.suiteId]);
    if (!row || !['pvt-matrix', 'regression-matrix'].includes(String(row.kind))) throw new Error('SPICE matrix not found for this project');
    const suite = record(row);
    if (identity.role !== 'admin' && (identity.role !== 'editor' || (suite.createdBy !== identity.userId && suite.ownerId !== identity.userId))) throw new Error('Only the suite owner, creator, or an admin can ingest results');
    const merged = mergeSpiceResults(suite.payload, input.results);
    if (!merged.added.length) return { suite, summary: merged.summary, replayed: true };
    const resultRecord = await createOperationRecord(identity, {
      projectId: input.projectId, category: 'spice', kind: 'result-batch', parentId: input.suiteId,
      title: `SPICE results · ${merged.added.length} points`,
      status: merged.added.some((item) => item.status !== 'passed') ? 'attention' : 'passed',
      payload: { results: merged.added }, evidence: merged.added.map((item) => `${item.waveformRef}#sha256=${item.sha256}`),
    }, requestId);
    const updatedAt = new Date().toISOString();
    await run('UPDATE commercial_operation_records SET payload_json = ?, status = ?, updated_at = ? WHERE tenant_id = ? AND project_id = ? AND id = ?', [JSON.stringify(merged.payload), merged.status, updatedAt, identity.tenantId, input.projectId, input.suiteId]);
    await appendAudit(identity, 'spice.results-ingested', suite.id, { resultRecordId: resultRecord.id, ...merged.summary }, requestId);
    return { suite: { ...suite, status: merged.status, payload: merged.payload, updatedAt }, resultRecord, summary: merged.summary, replayed: false };
  });
}

const SIGNOFF_DOMAINS = [
  ['sta', 'Static timing', ['sta', 'timing']],
  ['drc', 'Design rule checks', ['drc']],
  ['lvs', 'Layout versus schematic', ['lvs']],
  ['ir', 'IR drop', ['ir', 'irdrop']],
  ['em', 'Electromigration', ['em']],
  ['antenna', 'Antenna', ['antenna']],
  ['cdc', 'Clock-domain crossing', ['cdc']],
] as const;

export async function projectSignoffMatrix(identity: EdaIdentity, projectId: string): Promise<SignoffMatrix> {
  await projectExists(identity, projectId);
  const [corners, constraints, ppaRows, artifactRows, approvalRows, operations] = await Promise.all([
    all('SELECT c.name FROM commercial_corners c JOIN commercial_constraint_sets s ON s.id = c.constraint_set_id AND s.tenant_id = c.tenant_id AND s.project_id = c.project_id WHERE c.tenant_id = ? AND c.project_id = ? AND c.active = 1 AND s.active = 1', [
      identity.tenantId,
      projectId,
    ]),
    all('SELECT id FROM commercial_constraint_sets WHERE tenant_id = ? AND project_id = ? AND active = 1', [identity.tenantId, projectId]),
    all(
      'SELECT * FROM commercial_ppa_snapshots WHERE tenant_id = ? AND project_id = ? ORDER BY created_at DESC LIMIT 1',
      [identity.tenantId, projectId]
    ),
    all('SELECT * FROM commercial_artifacts WHERE tenant_id = ? AND project_id = ? ORDER BY created_at DESC, id DESC', [
      identity.tenantId,
      projectId,
    ]),
    all('SELECT * FROM commercial_approvals WHERE tenant_id = ? AND project_id = ?', [
      identity.tenantId,
      projectId,
    ]),
    listOperationRecords(identity, { projectId }),
  ]);
  const currentTime = Date.now();
  const waivers = operations.filter(
    (item) =>
      item.category === 'waiver' &&
      ['approved', 'active'].includes(item.status) &&
      Boolean(item.dueAt && Date.parse(item.dueAt) > currentTime) &&
      item.evidence.length > 0 && waiverPayloadSchema.safeParse(item.payload).success &&
      approvalRows.some((approval) => approval.target_type === 'waiver' && approval.target_id === item.id &&
        approval.status === 'approved' && approval.decided_by && approval.decided_by !== approval.requested_by && approval.decided_by !== item.createdBy)
  );
  const latestPpa = ppaRows[0];
  const latestManifest = await one("SELECT id FROM commercial_feature_records WHERE tenant_id = ? AND project_id = ? AND feature = 'tapeout-release' AND record_type = 'signed-manifest' ORDER BY created_at DESC, id DESC LIMIT 1", [identity.tenantId, projectId]);
  const release = latestManifest ? await verifyReleasePrerequisites(
    identity, projectId, String(latestManifest.id), latestPpa ? String(latestPpa.commit_sha) : null
  ) : undefined;
  const checks: SignoffCheck[] = await Promise.all(SIGNOFF_DOMAINS.map(async ([key, label, aliases]) => {
    const artifact = artifactRows.find((item) => aliases.some((alias) => String(item.kind).toLowerCase() === alias));
    const check: SignoffCheck = { key, label, domain: key.toUpperCase(), state: artifact ? 'attention' : 'missing',
      coverage: artifact ? 'Primary report requires verification' : 'No governed evidence',
      evidence: artifact ? [String(artifact.object_key)] : [], blockers: [] };
    if (!artifact) {
      check.blockers = [`Retain a normalized ${label.toLowerCase()} report; a waiver does not replace primary evidence`];
      return check;
    }
    try {
      if (Number(artifact.size_bytes) > 2 * 1024 * 1024) throw new Error('Normalized signoff reports must be at most 2 MiB');
      const body = await getWorkspaceObject(String(artifact.object_key));
      if (body.length !== Number(artifact.size_bytes) || createHash('sha256').update(body).digest('hex') !== artifact.sha256) throw new Error('Report checksum or size does not match the retained artifact');
      const parsed = signoffReportSchema.safeParse(JSON.parse(body.toString('utf8')));
      if (!parsed.success) throw new Error('Retain a normalized signoff report with measured checks and tool/context provenance');
      const report = parsed.data;
      if (report.domain !== key || report.runRef !== artifact.run_ref) throw new Error('Report domain or run identity does not match the artifact');
      if (!latestPpa || report.commitSha !== latestPpa.commit_sha || constraints.length !== 1 || report.constraintSetId !== constraints[0].id) throw new Error('Report does not match the current commit and active constraint version');
      if (Date.parse(report.completedAt) > currentTime || !report.corners.every((name) => corners.some((corner) => corner.name === name)) ||
          (key === 'sta' && corners.some((corner) => !report.corners.includes(String(corner.name))))) throw new Error('Report completion time or active corner coverage is invalid');
      const creator = await one("SELECT actor_id FROM commercial_audit_events WHERE tenant_id = ? AND resource = 'workspace_artifact' AND resource_id = ? AND action = 'create' ORDER BY created_at ASC LIMIT 1", [identity.tenantId, artifact.id]);
      const approved = approvalRows.some((item) => item.target_type === 'artifact' && item.target_id === artifact.id && item.status === 'approved' &&
        item.decided_by && item.decided_by !== item.requested_by && creator && item.decided_by !== creator.actor_id && String(item.decided_at) >= String(artifact.created_at));
      if (!approved) throw new Error('Independent approval of this exact report is required');
      const failures = report.checks.filter((item) => !signoffCheckPasses(item));
      const uncovered = failures.filter((item) => !waivers.some((waiver) => waiver.payload.domain === key && waiver.payload.rule === item.rule && waiver.payload.scope === item.scope));
      check.state = uncovered.length ? 'attention' : failures.length ? 'waived' : 'pass';
      check.coverage = `${report.checks.length - failures.length}/${report.checks.length} measured checks pass; ${report.corners.length} corner(s)`;
      check.blockers = uncovered.map((item) => `${item.rule} (${item.scope}): ${item.observed} does not satisfy ${item.comparison} ${item.limit}`);
      if (failures.length && !uncovered.length) check.coverage += '; remaining checks have independently approved, unexpired waivers';
    } catch (error) {
      check.blockers = [error instanceof Error ? error.message : 'Report could not be verified'];
    }
    return check;
  }));
  checks.unshift(
    {
      key: 'mcmm',
      label: 'MCMM scenario coverage',
      domain: 'MCMM',
      state: corners.length >= 3 ? 'pass' : 'attention',
      coverage: `${corners.length} active corner${corners.length === 1 ? '' : 's'}`,
      evidence: corners.map((item) => String(item.name)),
      blockers: corners.length >= 3 ? [] : ['Define at least three active PVT/RC corners'],
    },
    {
      key: 'ppa',
      label: 'PPA guardrails',
      domain: 'PPA',
      state: latestPpa && String(latestPpa.status) !== 'regression' ? 'pass' : latestPpa ? 'attention' : 'missing',
      coverage: latestPpa
        ? `Latest snapshot: ${String(latestPpa.commit_sha)} (${String(latestPpa.status)})`
        : 'No PPA baseline',
      evidence: latestPpa ? parseList(latestPpa.evidence_json) : [],
      blockers:
        latestPpa && String(latestPpa.status) !== 'regression'
          ? []
          : ['Record a passing candidate against the approved PPA baseline'],
    },
    {
      key: 'approval',
      label: 'Independent release approval',
      domain: 'GOVERNANCE',
      state: release?.ready ? 'pass' : 'missing',
      coverage: `${release?.approved ?? 0} independent approval(s) of the latest signed manifest`,
      evidence: latestManifest ? [String(latestManifest.id)] : [],
      blockers: release?.ready ? [] : release?.findings ?? ['Retain a signed manifest and request independent release approval'],
    }
  );
  const readiness = readinessScore(checks);
  const blocked = checks.some((check) => ['missing', 'attention'].includes(check.state));
  return {
    projectId,
    readiness,
    decision: blocked ? 'hold' : checks.some((check) => check.state === 'waived') ? 'conditional' : 'ready',
    checks,
    activeCorners: corners.length,
    openWaivers: waivers.length,
    generatedAt: new Date().toISOString(),
  };
}
