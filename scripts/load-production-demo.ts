/**
 * Production demo data — explicit opt-in.
 *
 * The normal loader (`load-demo-data.ts`) refuses production. This script is
 * the documented override, used when an operator wants the public deployment to
 * show populated screens: it tops up every table-backed feature to at least 15
 * rows in BOTH stores (SQLite core/EDA/analog/ML and PostgreSQL commercial/
 * academy), reusing the local loader for the SQLite side.
 *
 * Every row is marked DEMO. It never deletes non-demo rows and never runs
 * without ALLOW_PRODUCTION_DEMO=1.
 *
 * Usage (inside a container that can reach both stores):
 *   ALLOW_PRODUCTION_DEMO=1 CHIP_DB_PATH=... CHIP_COMMERCIAL_DATABASE_URL=... \
 *     npx tsx scripts/load-production-demo.ts
 */
import { loadEnvConfig } from '@next/env';

loadEnvConfig(process.cwd(), false);

import { spawnSync } from 'node:child_process';
import pg from 'pg';

const TARGET = 15;
const MARK = 'demo-production';

function assertAllowed(): void {
  if (process.env.ALLOW_PRODUCTION_DEMO !== '1') {
    throw new Error('Refusing to seed production demo data. Set ALLOW_PRODUCTION_DEMO=1 to opt in explicitly.');
  }
}

/* ------------------------------------------------------------------ Postgres */

/**
 * Schema-driven demo values.
 *
 * Rather than hand-listing columns (which silently missed NOT NULL fields), the
 * seeder reads each table's required columns from information_schema and fills
 * them deterministically: primary keys get a stable demo id, foreign keys a
 * matching demo id, text gets a DEMO string, numbers get a small index-based
 * value. This keeps the rows obviously fictional and the inserts valid.
 */
function demoValue(table: string, column: string, type: string, index: number): unknown {
  const now = new Date().toISOString();
  if (column === 'id' || column.endsWith('_id')) {
    if (column === 'id') return `demo-${table}-${index + 1}`;
    if (column === 'campaign_id') return `demo-design_search_campaigns-${(index % 15) + 1}`;
    if (column === 'project_id') return `demo-commercial_projects-${(index % 15) + 1}`;
    if (column === 'revision_id') return `demo-design_journey_revisions-${(index % 15) + 1}`;
    if (column === 'run_id') return `demo-design_journey_runs-${(index % 15) + 1}`;
    if (column === 'candidate_id') return `demo-design_search_candidates-${(index % 15) + 1}`;
    if (column === 'job_id') return `demo-job-${index + 1}`;
    if (column === 'constraint_set_id') return `demo-commercial_constraint_sets-${(index % 15) + 1}`;
    return `demo-ref-${index + 1}`;
  }
  if (column === 'tenant_id') return `demo-tenant-${index + 1}`;
  if (column === 'user_id' || column === 'created_by' || column === 'proposed_by' || column === 'owner_id' || column === 'requested_by' || column === 'actor_id' || column === 'author') {
    return `demo-user-${(index % 4) + 1}`;
  }
  if (column === 'created_at' || column === 'updated_at' || column === 'started_at' || column === 'requested_at' || column === 'next_attempt_at') return now;
  if (column.endsWith('_json')) return JSON.stringify({ demo: true, index: index + 1 });
  if (column === 'sha256') return String(index + 1).padStart(64, '0');
  if (column.endsWith('_sha') || column === 'source_hash' || column === 'suite_hash' || column === 'pdk_digest' || column === 'base_sha' || column === 'target_sha' || column === 'commit_sha' || column === 'baseline_sha') {
    return `${String(index + 1).padStart(40, '0')}`;
  }
  if (column === 'status' || column === 'human_status') return 'demo';
  if (column === 'active' || column === 'passed') return 1;
  if (type.startsWith('integer') || type === 'real' || type === 'double precision' || type === 'numeric') return 10 + index;
  if (column === 'name' || column === 'title' || column === 'topic') return `DEMO ${column} ${index + 1}`;
  return `DEMO ${column} ${index + 1}`;
}

async function seedPostgres(): Promise<Record<string, number>> {
  const connectionString = process.env.CHIP_COMMERCIAL_DATABASE_URL;
  if (!connectionString) {
    console.log('No CHIP_COMMERCIAL_DATABASE_URL set; skipping PostgreSQL seeding.');
    return {};
  }
  const ssl = process.env.CHIP_COMMERCIAL_DB_SSL === 'require' ? { rejectUnauthorized: false } : undefined;
  const pool = new pg.Pool({ connectionString, ssl, max: 2 });
  const result: Record<string, number> = {};
  try {
    const { rows } = await pool.query(
      "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
    );
    for (const { tablename } of rows as Array<{ tablename: string }>) {
      const current = Number((await pool.query(`SELECT COUNT(*)::int AS c FROM "${tablename}"`)).rows[0].c);
      result[tablename] = current;
      if (current >= TARGET) continue;
      const required = (await pool.query(
        "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = $1 AND is_nullable = 'NO' AND column_default IS NULL ORDER BY ordinal_position",
        [tablename],
      )).rows as Array<{ column_name: string; data_type: string }>;
      if (!required.length) {
        console.log(`  ${tablename}: ${current} rows (no required columns to fill)`);
        continue;
      }
      const ids = new Set<string>();
      let skipped = 0;
      for (let index = current; index < TARGET + skipped && index < TARGET * 3; index += 1) {
        const columns = required.map((column) => column.column_name);
        const values = required.map((column) => demoValue(tablename, column.column_name, column.data_type, index));
        const id = String(values[0]);
        if (ids.has(id)) continue;
        ids.add(id);
        const placeholders = columns.map((_, position) => `$${position + 1}`).join(', ');
        try {
          await pool.query(
            `INSERT INTO "${tablename}" (${columns.map((column) => `"${column}"`).join(', ')})
             VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
            values,
          );
        } catch (error) {
          skipped += 1;
          console.log(`    ${tablename}: row ${index + 1} skipped (${(error as Error).message.slice(0, 90)})`);
        }
      }
      const after = Number((await pool.query(`SELECT COUNT(*)::int AS c FROM "${tablename}"`)).rows[0].c);
      result[tablename] = after;
      console.log(`  ${tablename}: ${current} → ${after}${skipped ? ` (${skipped} skipped)` : ''}`);
    }
  } finally {
    await pool.end();
  }
  return result;
}

async function main(): Promise<void> {
  assertAllowed();
  console.log('Seeding SQLite side via the local loader (ALLOW_PRODUCTION_DEMO override)…');
  const child = spawnSync('npx', ['tsx', 'scripts/load-demo-data.ts'], {
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'development', PRODUCTION_DEMO_OVERRIDE: '1' },
  });
  if (child.status !== 0) throw new Error(`SQLite demo load failed with status ${child.status}`);

  console.log('Seeding PostgreSQL commercial/academy tables…');
  const postgres = await seedPostgres();

  const under = Object.entries(postgres).filter(([, count]) => count < TARGET);
  console.log(JSON.stringify({ postgres, under: under.map(([table, count]) => `${table}=${count}`) }, null, 2));
  if (under.length) {
    console.warn(`PostgreSQL tables still below ${TARGET}: ${under.map(([table, count]) => `${table}=${count}`).join(', ')}`);
  } else {
    console.log(`All PostgreSQL tables have at least ${TARGET} rows.`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
