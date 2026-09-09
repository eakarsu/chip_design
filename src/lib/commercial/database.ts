import 'server-only';

import Database from 'better-sqlite3';
import { AsyncLocalStorage } from 'node:async_hooks';
import { Pool, type PoolClient, type QueryResultRow } from 'pg';
import { getRawDb } from '@/lib/db/connection';

type SqliteDatabase = Database.Database;

declare global {
  var __chipCommercialPool: Pool | undefined;
  var __chipCommercialSchemaReady: Promise<void> | undefined;
}

const postgresUrl = process.env.CHIP_COMMERCIAL_DATABASE_URL ?? process.env.DATABASE_URL ?? '';

export const commercialDatabaseBackend: 'postgres' | 'sqlite' =
  process.env.NODE_ENV !== 'test' && /^postgres(?:ql)?:\/\//i.test(postgresUrl) ? 'postgres' : 'sqlite';

function pool(): Pool {
  if (!global.__chipCommercialPool) {
    global.__chipCommercialPool = new Pool({
      connectionString: postgresUrl,
      max: Number(process.env.CHIP_COMMERCIAL_DB_POOL_SIZE ?? 10),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      allowExitOnIdle: true,
      ssl:
        process.env.CHIP_COMMERCIAL_DB_SSL === 'require'
          ? { rejectUnauthorized: process.env.CHIP_COMMERCIAL_DB_SSL_VERIFY !== 'false' }
          : undefined,
    });
  }
  return global.__chipCommercialPool;
}

function postgresSql(sql: string): string {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

const transactionContext = new AsyncLocalStorage<{ client?: PoolClient; sqlite?: true }>();
let sqliteQueue: Promise<void> = Promise.resolve();

// SQLite shares a connection. Keep unrelated requests out of a transaction
// while its async callback is suspended, including read-only requests.
async function withSqliteAccess<T>(task: () => T | Promise<T>): Promise<T> {
  const previous = sqliteQueue;
  let release!: () => void;
  sqliteQueue = new Promise<void>((resolve) => { release = resolve; });
  await previous;
  try { return await task(); } finally { release(); }
}

export async function commercialTransaction<T>(task: () => Promise<T>): Promise<T> {
  if (transactionContext.getStore()) return task();
  await ensureCommercialSchema();
  if (commercialDatabaseBackend === 'postgres') {
    const client = await pool().connect();
    try {
      await client.query('BEGIN');
      const value = await transactionContext.run({ client }, task);
      await client.query('COMMIT');
      return value;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }
  return withSqliteAccess(async () => {
    const db = getRawDb();
    db.exec('BEGIN IMMEDIATE');
    try {
      const value = await transactionContext.run({ sqlite: true }, task);
      db.exec('COMMIT');
      return value;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  });
}

export async function lockCommercialProject(tenantId: string, projectId: string): Promise<void> {
  if (!transactionContext.getStore()) throw new Error('Project locks require a transaction');
  const row = await one(
    'SELECT id FROM commercial_projects WHERE tenant_id = ? AND id = ?' +
      (commercialDatabaseBackend === 'postgres' ? ' FOR UPDATE' : ''),
    [tenantId, projectId]
  );
  if (!row) throw new Error('Project not found for this tenant');
}

export async function all<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  values: unknown[] = []
): Promise<T[]> {
  await ensureCommercialSchema();
  if (commercialDatabaseBackend === 'postgres') {
    return (await (transactionContext.getStore()?.client ?? pool()).query<T>(postgresSql(sql), values)).rows;
  }
  const query = () => getRawDb().prepare(sql).all(...values) as T[];
  return transactionContext.getStore()?.sqlite ? query() : withSqliteAccess(query);
}

export async function one<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  values: unknown[] = []
): Promise<T | undefined> {
  const rows = await all<T>(sql, values);
  return rows[0];
}

export async function run(sql: string, values: unknown[] = []): Promise<number> {
  await ensureCommercialSchema();
  if (commercialDatabaseBackend === 'postgres') {
    return (await (transactionContext.getStore()?.client ?? pool()).query(postgresSql(sql), values)).rowCount ?? 0;
  }
  const query = () => getRawDb().prepare(sql).run(...values).changes;
  return transactionContext.getStore()?.sqlite ? query() : withSqliteAccess(query);
}

const schemaSql = `
  CREATE TABLE IF NOT EXISTS design_journey_revisions (
    id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, project_id TEXT NOT NULL,
    revision_number INTEGER NOT NULL, source_hash TEXT NOT NULL,
    document_json TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL,
    UNIQUE(tenant_id, project_id, revision_number)
  );
  CREATE TABLE IF NOT EXISTS design_journey_runs (
    id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, project_id TEXT NOT NULL,
    revision_id TEXT NOT NULL, job_id TEXT NOT NULL UNIQUE, kind TEXT NOT NULL,
    purpose TEXT NOT NULL, source_hash TEXT NOT NULL, suite_hash TEXT NOT NULL,
    challenge_id TEXT, created_by TEXT NOT NULL, created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS journey_runs_project ON design_journey_runs(tenant_id,project_id,created_at);
  CREATE TABLE IF NOT EXISTS design_journey_assessments (
    id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, project_id TEXT NOT NULL,
    run_id TEXT NOT NULL, user_id TEXT NOT NULL, document_json TEXT NOT NULL,
    created_at TEXT NOT NULL, UNIQUE(tenant_id,run_id,user_id)
  );
  CREATE TABLE IF NOT EXISTS design_journey_hardware (
    id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, project_id TEXT NOT NULL,
    revision_id TEXT NOT NULL, kind TEXT NOT NULL, document_json TEXT NOT NULL,
    created_by TEXT NOT NULL, created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS commercial_projects (
    id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, name TEXT NOT NULL,
    description TEXT NOT NULL, repository_url TEXT NOT NULL, default_branch TEXT NOT NULL,
    top_module TEXT NOT NULL, pdk_ref TEXT NOT NULL, status TEXT NOT NULL,
    created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    UNIQUE(tenant_id, name)
  );
  CREATE INDEX IF NOT EXISTS commercial_projects_tenant_idx ON commercial_projects(tenant_id);

  CREATE TABLE IF NOT EXISTS commercial_constraint_sets (
    id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, project_id TEXT NOT NULL,
    name TEXT NOT NULL, sdc TEXT NOT NULL, version INTEGER NOT NULL,
    active INTEGER NOT NULL, created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS commercial_constraints_tenant_project_idx ON commercial_constraint_sets(tenant_id, project_id);
  CREATE UNIQUE INDEX IF NOT EXISTS commercial_constraints_version_unique
    ON commercial_constraint_sets(tenant_id, project_id, name, version);
  CREATE UNIQUE INDEX IF NOT EXISTS commercial_constraints_active_unique
    ON commercial_constraint_sets(tenant_id, project_id) WHERE active = 1;

  CREATE TABLE IF NOT EXISTS commercial_corners (
    id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, project_id TEXT NOT NULL,
    constraint_set_id TEXT NOT NULL, name TEXT NOT NULL, process TEXT NOT NULL,
    voltage REAL NOT NULL, temperature REAL NOT NULL, liberty_ref TEXT NOT NULL,
    rc_corner TEXT NOT NULL, active INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS commercial_corners_tenant_project_idx ON commercial_corners(tenant_id, project_id);

  CREATE TABLE IF NOT EXISTS commercial_ppa_snapshots (
    id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, project_id TEXT NOT NULL,
    commit_sha TEXT NOT NULL, branch TEXT NOT NULL, message TEXT NOT NULL, author TEXT NOT NULL,
    area_um2 REAL NOT NULL, power_mw REAL NOT NULL, wns_ns REAL NOT NULL, tns_ns REAL NOT NULL,
    drc_count INTEGER NOT NULL, congestion_pct REAL NOT NULL, deltas_json TEXT NOT NULL,
    thresholds_json TEXT NOT NULL, evidence_json TEXT NOT NULL, status TEXT NOT NULL,
    created_at TEXT NOT NULL, UNIQUE(tenant_id, project_id, commit_sha)
  );
  CREATE INDEX IF NOT EXISTS commercial_ppa_tenant_project_idx ON commercial_ppa_snapshots(tenant_id, project_id, created_at);

  CREATE TABLE IF NOT EXISTS commercial_rtl_impacts (
    id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, project_id TEXT NOT NULL,
    base_sha TEXT NOT NULL, target_sha TEXT NOT NULL, changed_modules_json TEXT NOT NULL,
    timing_delta_ns REAL NOT NULL, power_delta_pct REAL NOT NULL,
    congestion_delta_pct REAL NOT NULL, drc_delta INTEGER NOT NULL,
    affected_paths_json TEXT NOT NULL, evidence_json TEXT NOT NULL,
    risk TEXT NOT NULL, created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS commercial_impacts_tenant_project_idx ON commercial_rtl_impacts(tenant_id, project_id, created_at);

  CREATE TABLE IF NOT EXISTS commercial_artifacts (
    id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, project_id TEXT NOT NULL,
    run_ref TEXT NOT NULL, kind TEXT NOT NULL, name TEXT NOT NULL,
    object_key TEXT NOT NULL, sha256 TEXT NOT NULL, size_bytes INTEGER NOT NULL,
    metadata_json TEXT NOT NULL, created_at TEXT NOT NULL,
    UNIQUE(tenant_id, object_key)
  );
  CREATE INDEX IF NOT EXISTS commercial_artifacts_tenant_project_idx ON commercial_artifacts(tenant_id, project_id, created_at);

  CREATE TABLE IF NOT EXISTS commercial_approvals (
    id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, project_id TEXT NOT NULL,
    target_type TEXT NOT NULL, target_id TEXT NOT NULL, status TEXT NOT NULL,
    rationale TEXT NOT NULL, requested_by TEXT NOT NULL, decided_by TEXT,
    requested_at TEXT NOT NULL, decided_at TEXT
  );
  CREATE INDEX IF NOT EXISTS commercial_approvals_tenant_project_idx ON commercial_approvals(tenant_id, project_id, status);

  CREATE TABLE IF NOT EXISTS commercial_ecos (
    id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, project_id TEXT NOT NULL,
    title TEXT NOT NULL, baseline_sha TEXT NOT NULL, target_sha TEXT NOT NULL,
    objective TEXT NOT NULL, patch TEXT NOT NULL, status TEXT NOT NULL,
    before_metrics_json TEXT NOT NULL, after_metrics_json TEXT NOT NULL,
    approval_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS commercial_ecos_tenant_project_idx ON commercial_ecos(tenant_id, project_id, status);

  CREATE TABLE IF NOT EXISTS commercial_feature_records (
    id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, project_id TEXT NOT NULL,
    feature TEXT NOT NULL, record_type TEXT NOT NULL, title TEXT NOT NULL,
    status TEXT NOT NULL, payload_json TEXT NOT NULL, evidence_json TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS commercial_features_tenant_project_idx ON commercial_feature_records(tenant_id, project_id, feature);

  CREATE TABLE IF NOT EXISTS commercial_ai_reviews (
    id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, project_id TEXT NOT NULL,
    feature TEXT NOT NULL, brief_json TEXT NOT NULL, provider TEXT NOT NULL,
    model TEXT NOT NULL, human_status TEXT NOT NULL, created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS commercial_reviews_tenant_project_idx ON commercial_ai_reviews(tenant_id, project_id, created_at);

  CREATE TABLE IF NOT EXISTS commercial_audit_events (
    id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, actor_id TEXT NOT NULL,
    action TEXT NOT NULL, resource TEXT NOT NULL, resource_id TEXT NOT NULL,
    details_json TEXT NOT NULL, request_id TEXT NOT NULL, created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS commercial_audit_tenant_idx ON commercial_audit_events(tenant_id, created_at);

  CREATE TABLE IF NOT EXISTS commercial_operation_records (
    id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, project_id TEXT,
    category TEXT NOT NULL, kind TEXT NOT NULL, title TEXT NOT NULL,
    status TEXT NOT NULL, owner_id TEXT NOT NULL, parent_id TEXT,
    payload_json TEXT NOT NULL, evidence_json TEXT NOT NULL, due_at TEXT,
    created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS commercial_operations_tenant_category_idx
    ON commercial_operation_records(tenant_id, category, updated_at);
  CREATE INDEX IF NOT EXISTS commercial_operations_tenant_project_idx
    ON commercial_operation_records(tenant_id, project_id, updated_at);

  CREATE TABLE IF NOT EXISTS academy_enrollments (
    id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, user_id TEXT NOT NULL,
    path_slug TEXT NOT NULL, status TEXT NOT NULL, diagnostic_score INTEGER,
    started_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    UNIQUE(tenant_id, user_id)
  );
  CREATE INDEX IF NOT EXISTS academy_enrollments_tenant_user_idx ON academy_enrollments(tenant_id, user_id);

  CREATE TABLE IF NOT EXISTS academy_progress (
    id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, user_id TEXT NOT NULL,
    topic_slug TEXT NOT NULL, status TEXT NOT NULL, best_score INTEGER NOT NULL,
    attempts INTEGER NOT NULL, completed_at TEXT, updated_at TEXT NOT NULL,
    UNIQUE(tenant_id, user_id, topic_slug)
  );
  CREATE INDEX IF NOT EXISTS academy_progress_tenant_user_idx ON academy_progress(tenant_id, user_id, updated_at);

  CREATE TABLE IF NOT EXISTS academy_submissions (
    id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, user_id TEXT NOT NULL,
    lab_slug TEXT NOT NULL, topic_slug TEXT NOT NULL, response_text TEXT NOT NULL,
    evidence_json TEXT NOT NULL, grade_json TEXT NOT NULL, score INTEGER NOT NULL,
    passed INTEGER NOT NULL, attempt INTEGER NOT NULL, created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS academy_submissions_tenant_user_idx ON academy_submissions(tenant_id, user_id, created_at);

  CREATE TABLE IF NOT EXISTS academy_assessments (
    id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, user_id TEXT NOT NULL,
    kind TEXT NOT NULL, answers_json TEXT NOT NULL, score INTEGER NOT NULL,
    result_json TEXT NOT NULL, created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS academy_assessments_tenant_user_idx ON academy_assessments(tenant_id, user_id, created_at);

  CREATE TABLE IF NOT EXISTS academy_capstones (
    id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, user_id TEXT NOT NULL,
    title TEXT NOT NULL, specification TEXT NOT NULL, architecture TEXT NOT NULL,
    verification_plan TEXT NOT NULL, evidence_json TEXT NOT NULL,
    status TEXT NOT NULL, score INTEGER NOT NULL, feedback TEXT NOT NULL,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    UNIQUE(tenant_id, user_id)
  );
  CREATE INDEX IF NOT EXISTS academy_capstones_tenant_user_idx ON academy_capstones(tenant_id, user_id);

  CREATE TABLE IF NOT EXISTS academy_tutor_messages (
    id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, user_id TEXT NOT NULL,
    topic_slug TEXT NOT NULL, question TEXT NOT NULL, response_json TEXT NOT NULL,
    model TEXT NOT NULL, created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS academy_tutor_tenant_user_idx ON academy_tutor_messages(tenant_id, user_id, created_at);
`;

function ensureSqliteSchema(db: SqliteDatabase): void {
  db.transaction(() => db.exec(schemaSql))();
}

async function ensurePostgresSchema(client: PoolClient): Promise<void> {
  await client.query('BEGIN');
  try { await client.query(schemaSql); await client.query('COMMIT'); }
  catch (error) { await client.query('ROLLBACK'); throw error; }
}

const requiredCommercialIndexes = ['commercial_constraints_version_unique', 'commercial_constraints_active_unique'];

const requiredCommercialTables = [
  'design_journey_revisions',
  'design_journey_runs',
  'design_journey_assessments',
  'design_journey_hardware',
  'commercial_projects',
  'commercial_constraint_sets',
  'commercial_corners',
  'commercial_ppa_snapshots',
  'commercial_rtl_impacts',
  'commercial_artifacts',
  'commercial_approvals',
  'commercial_ecos',
  'commercial_feature_records',
  'commercial_ai_reviews',
  'commercial_audit_events',
  'commercial_operation_records',
  'academy_enrollments',
  'academy_progress',
  'academy_submissions',
  'academy_assessments',
  'academy_capstones',
  'academy_tutor_messages',
];

function validateSqliteSchema(db: SqliteDatabase): void {
  // Academy tables deliberately share this governed database but do not use
  // the commercial_ prefix. Validate the complete required table set.
  const rows = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>;
  const present = new Set(rows.map((row) => row.name));
  const missing = requiredCommercialTables.filter((table) => !present.has(table));
  const indexes = new Set((db.prepare("SELECT name FROM sqlite_master WHERE type = 'index'").all() as Array<{ name: string }>).map((row) => row.name));
  missing.push(...requiredCommercialIndexes.filter((index) => !indexes.has(index)));
  if (missing.length) throw new Error(`commercial database migration required; missing: ${missing.join(', ')}`);
}

async function validatePostgresSchema(client: PoolClient): Promise<void> {
  const result = await client.query<{ table_name: string }>(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
  );
  const present = new Set(result.rows.map((row) => row.table_name));
  const missing = requiredCommercialTables.filter((table) => !present.has(table));
  const indexes = await client.query<{ indexname: string }>("SELECT indexname FROM pg_indexes WHERE schemaname = 'public'");
  const presentIndexes = new Set(indexes.rows.map((row) => row.indexname));
  missing.push(...requiredCommercialIndexes.filter((index) => !presentIndexes.has(index)));
  if (missing.length) throw new Error(`commercial database migration required; missing: ${missing.join(', ')}`);
}

export async function ensureCommercialSchema(): Promise<void> {
  if (!global.__chipCommercialSchemaReady) {
    global.__chipCommercialSchemaReady = (async () => {
      if (commercialDatabaseBackend === 'postgres') {
        const client = await pool().connect();
        try {
          if (process.env.NODE_ENV === 'production' && process.env.CHIP_ALLOW_SCHEMA_MIGRATION !== 'true')
            await validatePostgresSchema(client);
          else await ensurePostgresSchema(client);
        } finally {
          client.release();
        }
      } else {
        if (process.env.NODE_ENV === 'production' && process.env.CHIP_ALLOW_SCHEMA_MIGRATION !== 'true')
          validateSqliteSchema(getRawDb());
        else ensureSqliteSchema(getRawDb());
      }
    })().catch((error) => {
      global.__chipCommercialSchemaReady = undefined;
      throw error;
    });
  }
  return global.__chipCommercialSchemaReady;
}
