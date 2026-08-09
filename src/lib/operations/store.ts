import 'server-only';

import { randomUUID } from 'crypto';
import type { EdaIdentity } from '@/lib/eda/identity';
import { all, one, run } from '@/lib/commercial/database';
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
  await projectExists(identity, input.projectId);
  if (input.parentId) {
    const parent = await one('SELECT id FROM commercial_operation_records WHERE tenant_id = ? AND id = ?', [
      identity.tenantId,
      input.parentId,
    ]);
    if (!parent) throw new Error('Parent operation record not found');
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
      JSON.stringify(input.payload ?? {}),
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
  return record(
    (await one('SELECT * FROM commercial_operation_records WHERE tenant_id = ? AND id = ?', [identity.tenantId, id]))!
  );
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
  const currentRow = await one('SELECT * FROM commercial_operation_records WHERE tenant_id = ? AND id = ?', [
    identity.tenantId,
    input.id,
  ]);
  if (!currentRow) throw new Error('Operation record not found');
  const current = record(currentRow);
  if (identity.role !== 'admin' && current.createdBy !== identity.userId && current.ownerId !== identity.userId) {
    throw new Error('Only the owner, creator, or an admin can update this record');
  }
  if (current.category === 'waiver' && input.status && ['approved', 'active'].includes(input.status)) {
    if (identity.role !== 'admin') throw new Error('Only an independent admin reviewer can activate a waiver');
    const approved = await one(
      "SELECT id FROM commercial_approvals WHERE tenant_id = ? AND target_type = 'waiver' AND target_id = ? AND status = 'approved'",
      [identity.tenantId, current.id]
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
  const [corners, ppaRows, artifactRows, approvalRows, operations] = await Promise.all([
    all('SELECT name FROM commercial_corners WHERE tenant_id = ? AND project_id = ? AND active = 1', [
      identity.tenantId,
      projectId,
    ]),
    all(
      'SELECT * FROM commercial_ppa_snapshots WHERE tenant_id = ? AND project_id = ? ORDER BY created_at DESC LIMIT 1',
      [identity.tenantId, projectId]
    ),
    all('SELECT name, kind, object_key FROM commercial_artifacts WHERE tenant_id = ? AND project_id = ?', [
      identity.tenantId,
      projectId,
    ]),
    all('SELECT status, target_type, target_id FROM commercial_approvals WHERE tenant_id = ? AND project_id = ?', [
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
      (!item.dueAt || new Date(item.dueAt).getTime() > currentTime)
  );
  const evidenceText = artifactRows.map((item) => `${item.name} ${item.kind} ${item.object_key}`.toLowerCase());
  const checks: SignoffCheck[] = SIGNOFF_DOMAINS.map(([key, label, aliases]) => {
    const evidence = artifactRows
      .filter((_, index) => aliases.some((alias) => evidenceText[index].includes(alias)))
      .map((item) => String(item.object_key));
    const waiver = waivers.find((item) => String(item.payload.domain ?? '').toLowerCase() === key);
    return {
      key,
      label,
      domain: key.toUpperCase(),
      state: evidence.length ? 'pass' : waiver ? 'waived' : 'missing',
      coverage: evidence.length
        ? `${evidence.length} governed artifact${evidence.length === 1 ? '' : 's'}`
        : waiver
          ? 'Covered by an approved waiver'
          : 'No governed evidence',
      evidence: evidence.length ? evidence : (waiver?.evidence ?? []),
      blockers: evidence.length || waiver ? [] : [`Upload or generate ${label.toLowerCase()} evidence`],
      owner: waiver?.ownerId,
    };
  });
  const latestPpa = ppaRows[0];
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
      state: approvalRows.some(
        (item) => item.status === 'approved' && ['run', 'artifact'].includes(String(item.target_type))
      )
        ? 'pass'
        : 'missing',
      coverage: `${approvalRows.filter((item) => item.status === 'approved').length} approved decision(s)`,
      evidence: approvalRows.filter((item) => item.status === 'approved').map((item) => String(item.target_id)),
      blockers: approvalRows.some((item) => item.status === 'approved')
        ? []
        : ['Request an independent release approval'],
    }
  );
  const readiness = readinessScore(checks);
  const hardMissing = checks.filter((check) => check.state === 'missing').length;
  return {
    projectId,
    readiness,
    decision:
      hardMissing === 0 && readiness >= 90 ? 'ready' : hardMissing <= 2 && readiness >= 70 ? 'conditional' : 'hold',
    checks,
    activeCorners: corners.length,
    openWaivers: waivers.length,
    generatedAt: new Date().toISOString(),
  };
}
