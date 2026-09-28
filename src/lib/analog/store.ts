/**
 * SQLite persistence for the Analog Power Design Studio.
 *
 * Schema creation is inline and idempotent (matching src/lib/db/connection.ts)
 * so the first launch works without a migration step. Every run (design,
 * simulation, AI review) is recorded with its model and reported cost.
 */
import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { getRawDb } from '@/lib/db/connection';
import type { AnalogProject, AiReviewResult, BuckDesign, PcbCheck, Requirements, SimulationResult } from './types';

export function ensureAnalogSchema(raw: Database.Database = getRawDb()): Database.Database {
  raw.exec(`
    CREATE TABLE IF NOT EXISTS analog_projects (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL DEFAULT 'local',
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      requirements_json TEXT,
      selected_ic_json TEXT,
      design_json TEXT,
      transient_json TEXT,
      ac_json TEXT,
      pcb_json TEXT,
      review_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_analog_projects_tenant ON analog_projects(tenant_id, updated_at);

    CREATE TABLE IF NOT EXISTS analog_runs (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      tenant_id TEXT NOT NULL DEFAULT 'local',
      kind TEXT NOT NULL,
      model TEXT,
      cost_usd REAL,
      summary_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_analog_runs_project ON analog_runs(project_id, created_at);
  `);
  return raw;
}

interface ProjectRow {
  id: string;
  tenant_id: string;
  name: string;
  status: string;
  requirements_json: string | null;
  selected_ic_json: string | null;
  design_json: string | null;
  transient_json: string | null;
  ac_json: string | null;
  pcb_json: string | null;
  review_json: string | null;
  created_at: string;
  updated_at: string;
}

const parse = <T>(value: string | null): T | null => {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
};

function toProject(row: ProjectRow): AnalogProject & { transient: SimulationResult | null; ac: SimulationResult | null } {
  return {
    id: row.id,
    name: row.name,
    status: row.status as AnalogProject['status'],
    requirements: parse<Requirements>(row.requirements_json),
    selectedIc: parse(row.selected_ic_json),
    design: parse<BuckDesign>(row.design_json),
    simulation: parse<SimulationResult>(row.transient_json),
    transient: parse<SimulationResult>(row.transient_json),
    ac: parse<SimulationResult>(row.ac_json),
    pcbChecks: parse<PcbCheck[]>(row.pcb_json) ?? [],
    review: parse<AiReviewResult>(row.review_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listProjects(tenantId = 'local') {
  const db = ensureAnalogSchema();
  const rows = db.prepare('SELECT * FROM analog_projects WHERE tenant_id = ? ORDER BY updated_at DESC LIMIT 200').all(tenantId) as ProjectRow[];
  return rows.map(toProject);
}

export function getProject(id: string, tenantId = 'local') {
  const db = ensureAnalogSchema();
  const row = db.prepare('SELECT * FROM analog_projects WHERE id = ? AND tenant_id = ?').get(id, tenantId) as ProjectRow | undefined;
  return row ? toProject(row) : null;
}

export function createProject(input: { name: string; requirements?: Requirements; tenantId?: string }) {
  const db = ensureAnalogSchema();
  const now = new Date().toISOString();
  const id = randomUUID();
  db.prepare(
    `INSERT INTO analog_projects (id, tenant_id, name, status, requirements_json, created_at, updated_at)
     VALUES (?, ?, ?, 'draft', ?, ?, ?)`,
  ).run(id, input.tenantId ?? 'local', input.name, input.requirements ? JSON.stringify(input.requirements) : null, now, now);
  return getProject(id, input.tenantId ?? 'local');
}

export function updateProject(id: string, patch: Partial<Pick<AnalogProject, 'name' | 'status' | 'requirements' | 'selectedIc' | 'design' | 'simulation' | 'review'>> & { transient?: SimulationResult | null; ac?: SimulationResult | null; pcbChecks?: PcbCheck[] }, tenantId = 'local') {
  const db = ensureAnalogSchema();
  const existing = getProject(id, tenantId);
  if (!existing) return null;
  const now = new Date().toISOString();
  const merged = {
    name: patch.name ?? existing.name,
    status: patch.status ?? existing.status,
    requirements: patch.requirements !== undefined ? patch.requirements : existing.requirements,
    selectedIc: patch.selectedIc !== undefined ? patch.selectedIc : existing.selectedIc,
    design: patch.design !== undefined ? patch.design : existing.design,
    transient: patch.transient !== undefined ? patch.transient : existing.simulation,
    ac: patch.ac !== undefined ? patch.ac : (existing as { ac?: SimulationResult | null }).ac ?? null,
    pcbChecks: patch.pcbChecks !== undefined ? patch.pcbChecks : existing.pcbChecks,
    review: patch.review !== undefined ? patch.review : existing.review,
  };
  db.prepare(
    `UPDATE analog_projects SET name=?, status=?, requirements_json=?, selected_ic_json=?, design_json=?, transient_json=?, ac_json=?, pcb_json=?, review_json=?, updated_at=? WHERE id=? AND tenant_id=?`,
  ).run(
    merged.name,
    merged.status,
    merged.requirements ? JSON.stringify(merged.requirements) : null,
    merged.selectedIc ? JSON.stringify(merged.selectedIc) : null,
    merged.design ? JSON.stringify(merged.design) : null,
    merged.transient ? JSON.stringify(merged.transient) : null,
    merged.ac ? JSON.stringify(merged.ac) : null,
    merged.pcbChecks.length ? JSON.stringify(merged.pcbChecks) : null,
    merged.review ? JSON.stringify(merged.review) : null,
    now,
    id,
    tenantId,
  );
  return getProject(id, tenantId);
}

export function deleteProject(id: string, tenantId = 'local') {
  const db = ensureAnalogSchema();
  const result = db.prepare('DELETE FROM analog_projects WHERE id = ? AND tenant_id = ?').run(id, tenantId);
  return result.changes > 0;
}

export function recordRun(input: { projectId?: string; kind: 'design' | 'transient' | 'ac' | 'review' | 'tuning'; model?: string; costUsd?: number; summary?: unknown; tenantId?: string }) {
  const db = ensureAnalogSchema();
  db.prepare(
    `INSERT INTO analog_runs (id, project_id, tenant_id, kind, model, cost_usd, summary_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(),
    input.projectId ?? null,
    input.tenantId ?? 'local',
    input.kind,
    input.model ?? null,
    input.costUsd ?? null,
    JSON.stringify(input.summary ?? {}),
    new Date().toISOString(),
  );
}

export function listRuns(projectId: string, tenantId = 'local') {
  const db = ensureAnalogSchema();
  return db
    .prepare('SELECT id, kind, model, cost_usd, summary_json, created_at FROM analog_runs WHERE project_id = ? AND tenant_id = ? ORDER BY created_at DESC LIMIT 200')
    .all(projectId, tenantId)
    .map((row) => {
      const typed = row as { id: string; kind: string; model: string | null; cost_usd: number | null; summary_json: string; created_at: string };
      return { ...typed, summary: parse(typed.summary_json) };
    });
}
