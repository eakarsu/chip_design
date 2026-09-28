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

interface ColumnSpec {
  name: string;
  value: (index: number) => unknown;
}

/** Minimal, honest demo rows for the commercial and academy tables. */
function postgresRows(table: string): { columns: string; values: ColumnSpec[] } {
  const now = new Date().toISOString();
  const tenants = ['demo-tenant'];
  const users = Array.from({ length: 4 }, (_, i) => `demo-user-${i + 1}`);
  const projectId = 'demo-project-1';
  const text = (value: string) => value;
  const spec: Record<string, { columns: string; values: ColumnSpec[] }> = {
    design_journey_revisions: { columns: 'id, tenant_id, project_id, revision, rtl_text, sdc_text, created_by, created_at', values: [
      { name: 'id', value: (i) => `demo-jrev-${i + 1}` }, { name: 'tenant_id', value: () => tenants[0] },
      { name: 'project_id', value: () => projectId }, { name: 'revision', value: (i) => i + 1 },
      { name: 'rtl_text', value: (i) => text(`// DEMO revision ${i + 1}`) }, { name: 'sdc_text', value: () => text('create_clock -period 10') },
      { name: 'created_by', value: () => users[0] }, { name: 'created_at', value: () => now }] },
    design_journey_runs: { columns: 'id, tenant_id, project_id, revision_id, status, metrics_json, created_at', values: [
      { name: 'id', value: (i) => `demo-jrun-${i + 1}` }, { name: 'tenant_id', value: () => tenants[0] },
      { name: 'project_id', value: () => projectId }, { name: 'revision_id', value: (i) => `demo-jrev-${i + 1}` },
      { name: 'status', value: () => 'complete' }, { name: 'metrics_json', value: () => JSON.stringify({ demo: true, wns: 0.1 }) },
      { name: 'created_at', value: () => now }] },
    design_journey_assessments: { columns: 'id, tenant_id, project_id, kind, score, result_json, created_at', values: [
      { name: 'id', value: (i) => `demo-jassess-${i + 1}` }, { name: 'tenant_id', value: () => tenants[0] },
      { name: 'project_id', value: () => projectId }, { name: 'kind', value: () => 'review' },
      { name: 'score', value: (i) => 60 + i }, { name: 'result_json', value: () => JSON.stringify({ demo: true }) }, { name: 'created_at', value: () => now }] },
    design_journey_hardware: { columns: 'id, tenant_id, project_id, device, instrument, units, provenance_json, created_at', values: [
      { name: 'id', value: (i) => `demo-jhw-${i + 1}` }, { name: 'tenant_id', value: () => tenants[0] },
      { name: 'project_id', value: () => projectId }, { name: 'device', value: () => 'DEMO scope' },
      { name: 'instrument', value: () => 'DEMO analyser' }, { name: 'units', value: () => 'mV' },
      { name: 'provenance_json', value: () => JSON.stringify({ demo: true }) }, { name: 'created_at', value: () => now }] },
    design_search_campaigns: { columns: 'id, tenant_id, project_id, objective, status, budget_json, created_at, updated_at', values: [
      { name: 'id', value: (i) => `demo-campaign-${i + 1}` }, { name: 'tenant_id', value: () => tenants[0] },
      { name: 'project_id', value: () => projectId }, { name: 'objective', value: (i) => text(`DEMO objective ${i + 1}`) },
      { name: 'status', value: () => 'complete' }, { name: 'budget_json', value: () => JSON.stringify({ demo: true }) },
      { name: 'created_at', value: () => now }, { name: 'updated_at', value: () => now }] },
    design_search_candidates: { columns: 'id, campaign_id, tenant_id, title, hypothesis, status, created_at', values: [
      { name: 'id', value: (i) => `demo-candidate-${i + 1}` }, { name: 'campaign_id', value: (i) => `demo-campaign-${(i % 15) + 1}` },
      { name: 'tenant_id', value: () => tenants[0] }, { name: 'title', value: (i) => text(`DEMO candidate ${i + 1}`) },
      { name: 'hypothesis', value: () => text('DEMO hypothesis for screen demonstration.') }, { name: 'status', value: () => 'proposed' }, { name: 'created_at', value: () => now }] },
    design_search_rtl_candidates: { columns: 'id, campaign_id, tenant_id, title, rtl_text, created_at', values: [
      { name: 'id', value: (i) => `demo-rtlc-${i + 1}` }, { name: 'campaign_id', value: (i) => `demo-campaign-${(i % 15) + 1}` },
      { name: 'tenant_id', value: () => tenants[0] }, { name: 'title', value: (i) => text(`DEMO RTL candidate ${i + 1}`) },
      { name: 'rtl_text', value: (i) => text(`module demo_${i + 1}; endmodule`) }, { name: 'created_at', value: () => now }] },
    design_search_proofs: { columns: 'id, campaign_id, candidate_id, tenant_id, kind, result, created_at', values: [
      { name: 'id', value: (i) => `demo-proof-${i + 1}` }, { name: 'campaign_id', value: (i) => `demo-campaign-${(i % 15) + 1}` },
      { name: 'candidate_id', value: (i) => `demo-candidate-${i + 1}` }, { name: 'tenant_id', value: () => tenants[0] },
      { name: 'kind', value: () => 'equivalence' }, { name: 'result', value: () => 'equivalent' }, { name: 'created_at', value: () => now }] },
    design_search_agent_runs: { columns: 'id, campaign_id, tenant_id, role, model, status, created_at', values: [
      { name: 'id', value: (i) => `demo-agentrun-${i + 1}` }, { name: 'campaign_id', value: (i) => `demo-campaign-${(i % 15) + 1}` },
      { name: 'tenant_id', value: () => tenants[0] }, { name: 'role', value: () => 'design' },
      { name: 'model', value: () => 'demo' }, { name: 'status', value: () => 'complete' }, { name: 'created_at', value: () => now }] },
    design_search_agent_events: { columns: 'id, run_id, tenant_id, kind, payload_json, created_at', values: [
      { name: 'id', value: (i) => `demo-agentevent-${i + 1}` }, { name: 'run_id', value: (i) => `demo-agentrun-${i + 1}` },
      { name: 'tenant_id', value: () => tenants[0] }, { name: 'kind', value: () => 'step' },
      { name: 'payload_json', value: () => JSON.stringify({ demo: true }) }, { name: 'created_at', value: () => now }] },
    design_search_agent_reviews: { columns: 'id, run_id, tenant_id, reviewer, decision, notes, created_at', values: [
      { name: 'id', value: (i) => `demo-agentreview-${i + 1}` }, { name: 'run_id', value: (i) => `demo-agentrun-${i + 1}` },
      { name: 'tenant_id', value: () => tenants[0] }, { name: 'reviewer', value: () => users[0] },
      { name: 'decision', value: () => 'accepted' }, { name: 'notes', value: () => text('DEMO review') }, { name: 'created_at', value: () => now }] },
    commercial_projects: { columns: 'id, tenant_id, name, status, created_by, created_at, updated_at', values: [
      { name: 'id', value: (i) => `demo-cproj-${i + 1}` }, { name: 'tenant_id', value: () => tenants[0] },
      { name: 'name', value: (i) => text(`DEMO commercial project ${i + 1}`) }, { name: 'status', value: () => 'active' },
      { name: 'created_by', value: () => users[0] }, { name: 'created_at', value: () => now }, { name: 'updated_at', value: () => now }] },
    commercial_constraint_sets: { columns: 'id, tenant_id, project_id, version, active, sdc_text, created_by, created_at', values: [
      { name: 'id', value: (i) => `demo-constraint-${i + 1}` }, { name: 'tenant_id', value: () => tenants[0] },
      { name: 'project_id', value: (i) => `demo-cproj-${i + 1}` }, { name: 'version', value: (i) => i + 1 },
      { name: 'active', value: (i) => (i === 0 ? 1 : 0) }, { name: 'sdc_text', value: () => text('create_clock -period 10') },
      { name: 'created_by', value: () => users[0] }, { name: 'created_at', value: () => now }] },
    commercial_corners: { columns: 'id, tenant_id, project_id, name, created_at', values: [
      { name: 'id', value: (i) => `demo-corner-${i + 1}` }, { name: 'tenant_id', value: () => tenants[0] },
      { name: 'project_id', value: (i) => `demo-cproj-${i + 1}` }, { name: 'name', value: (i) => `DEMO corner ${i + 1}` }, { name: 'created_at', value: () => now }] },
    commercial_ppa_snapshots: { columns: 'id, tenant_id, project_id, metrics_json, created_at', values: [
      { name: 'id', value: (i) => `demo-ppa-${i + 1}` }, { name: 'tenant_id', value: () => tenants[0] },
      { name: 'project_id', value: (i) => `demo-cproj-${i + 1}` }, { name: 'metrics_json', value: (i) => JSON.stringify({ demo: true, area: 1000 + i }) }, { name: 'created_at', value: () => now }] },
    commercial_rtl_impacts: { columns: 'id, tenant_id, project_id, summary, created_at', values: [
      { name: 'id', value: (i) => `demo-impact-${i + 1}` }, { name: 'tenant_id', value: () => tenants[0] },
      { name: 'project_id', value: (i) => `demo-cproj-${i + 1}` }, { name: 'summary', value: (i) => text(`DEMO RTL impact ${i + 1}`) }, { name: 'created_at', value: () => now }] },
    commercial_artifacts: { columns: 'id, tenant_id, project_id, kind, object_key, sha256, created_at', values: [
      { name: 'id', value: (i) => `demo-artifact-${i + 1}` }, { name: 'tenant_id', value: () => tenants[0] },
      { name: 'project_id', value: (i) => `demo-cproj-${i + 1}` }, { name: 'kind', value: () => 'report' },
      { name: 'object_key', value: (i) => `demo/artifact-${i + 1}` }, { name: 'sha256', value: (i) => String(i).padStart(64, '0') }, { name: 'created_at', value: () => now }] },
    commercial_approvals: { columns: 'id, tenant_id, project_id, subject, status, requested_by, created_at', values: [
      { name: 'id', value: (i) => `demo-approval-${i + 1}` }, { name: 'tenant_id', value: () => tenants[0] },
      { name: 'project_id', value: (i) => `demo-cproj-${i + 1}` }, { name: 'subject', value: (i) => text(`DEMO approval ${i + 1}`) },
      { name: 'status', value: () => 'pending' }, { name: 'requested_by', value: () => users[0] }, { name: 'created_at', value: () => now }] },
    commercial_ecos: { columns: 'id, tenant_id, project_id, summary, status, created_at', values: [
      { name: 'id', value: (i) => `demo-eco-${i + 1}` }, { name: 'tenant_id', value: () => tenants[0] },
      { name: 'project_id', value: (i) => `demo-cproj-${i + 1}` }, { name: 'summary', value: (i) => text(`DEMO ECO ${i + 1}`) },
      { name: 'status', value: () => 'draft' }, { name: 'created_at', value: () => now }] },
    commercial_feature_records: { columns: 'id, tenant_id, project_id, name, value_json, created_at', values: [
      { name: 'id', value: (i) => `demo-feature-${i + 1}` }, { name: 'tenant_id', value: () => tenants[0] },
      { name: 'project_id', value: (i) => `demo-cproj-${i + 1}` }, { name: 'name', value: (i) => `DEMO feature ${i + 1}` },
      { name: 'value_json', value: () => JSON.stringify({ demo: true }) }, { name: 'created_at', value: () => now }] },
    commercial_ai_reviews: { columns: 'id, tenant_id, project_id, model, status, summary, created_at', values: [
      { name: 'id', value: (i) => `demo-ai-review-${i + 1}` }, { name: 'tenant_id', value: () => tenants[0] },
      { name: 'project_id', value: (i) => `demo-cproj-${i + 1}` }, { name: 'model', value: () => 'demo' },
      { name: 'status', value: () => 'draft' }, { name: 'summary', value: (i) => text(`DEMO AI review ${i + 1}`) }, { name: 'created_at', value: () => now }] },
    commercial_audit_events: { columns: 'id, tenant_id, project_id, actor, action, detail_json, created_at', values: [
      { name: 'id', value: (i) => `demo-caudit-${i + 1}` }, { name: 'tenant_id', value: () => tenants[0] },
      { name: 'project_id', value: (i) => `demo-cproj-${i + 1}` }, { name: 'actor', value: () => users[0] },
      { name: 'action', value: () => 'DEMO_EVENT' }, { name: 'detail_json', value: () => JSON.stringify({ demo: true }) }, { name: 'created_at', value: () => now }] },
    commercial_operation_records: { columns: 'id, tenant_id, project_id, category, payload_json, evidence_json, created_by, created_at, updated_at', values: [
      { name: 'id', value: (i) => `demo-op-${i + 1}` }, { name: 'tenant_id', value: () => tenants[0] },
      { name: 'project_id', value: (i) => `demo-cproj-${i + 1}` }, { name: 'category', value: () => 'demo' },
      { name: 'payload_json', value: () => JSON.stringify({ demo: true }) }, { name: 'evidence_json', value: () => JSON.stringify({ demo: true }) },
      { name: 'created_by', value: () => users[0] }, { name: 'created_at', value: () => now }, { name: 'updated_at', value: () => now }] },
    academy_enrollments: { columns: 'id, tenant_id, user_id, path_slug, status, diagnostic_score, started_at, updated_at', values: [
      { name: 'id', value: (i) => `demo-enroll-${i + 1}` }, { name: 'tenant_id', value: () => tenants[0] },
      { name: 'user_id', value: (i) => `demo-user-${(i % 4) + 1}` }, { name: 'path_slug', value: (i) => `demo-path-${i + 1}` },
      { name: 'status', value: () => 'active' }, { name: 'diagnostic_score', value: (i) => 55 + i },
      { name: 'started_at', value: () => now }, { name: 'updated_at', value: () => now }] },
    academy_progress: { columns: 'id, tenant_id, user_id, topic_slug, status, best_score, attempts, updated_at', values: [
      { name: 'id', value: (i) => `demo-progress-${i + 1}` }, { name: 'tenant_id', value: () => tenants[0] },
      { name: 'user_id', value: (i) => `demo-user-${(i % 4) + 1}` }, { name: 'topic_slug', value: (i) => `demo-topic-${i + 1}` },
      { name: 'status', value: () => 'complete' }, { name: 'best_score', value: (i) => 70 + i % 20 }, { name: 'attempts', value: (i) => 1 + (i % 3) },
      { name: 'updated_at', value: () => now }] },
    academy_submissions: { columns: 'id, tenant_id, user_id, lab_slug, topic_slug, response_text, evidence_json, grade_json, score, passed, attempt, created_at', values: [
      { name: 'id', value: (i) => `demo-submission-${i + 1}` }, { name: 'tenant_id', value: () => tenants[0] },
      { name: 'user_id', value: (i) => `demo-user-${(i % 4) + 1}` }, { name: 'lab_slug', value: (i) => `demo-lab-${i + 1}` },
      { name: 'topic_slug', value: (i) => `demo-topic-${i + 1}` }, { name: 'response_text', value: () => text('DEMO submission') },
      { name: 'evidence_json', value: () => JSON.stringify({ demo: true }) }, { name: 'grade_json', value: () => JSON.stringify({ score: 80 }) },
      { name: 'score', value: (i) => 70 + (i % 25) }, { name: 'passed', value: () => 1 }, { name: 'attempt', value: () => 1 }, { name: 'created_at', value: () => now }] },
    academy_assessments: { columns: 'id, tenant_id, user_id, kind, answers_json, score, result_json, created_at', values: [
      { name: 'id', value: (i) => `demo-assessment-${i + 1}` }, { name: 'tenant_id', value: () => tenants[0] },
      { name: 'user_id', value: (i) => `demo-user-${(i % 4) + 1}` }, { name: 'kind', value: () => 'diagnostic' },
      { name: 'answers_json', value: () => JSON.stringify({ demo: true }) }, { name: 'score', value: (i) => 60 + i },
      { name: 'result_json', value: () => JSON.stringify({ demo: true }) }, { name: 'created_at', value: () => now }] },
    academy_capstones: { columns: 'id, tenant_id, user_id, title, specification, architecture, verification_plan, evidence_json, status, score, feedback, created_at, updated_at', values: [
      { name: 'id', value: (i) => `demo-capstone-${i + 1}` }, { name: 'tenant_id', value: () => tenants[0] },
      { name: 'user_id', value: (i) => `demo-user-${(i % 4) + 1}` }, { name: 'title', value: (i) => text(`DEMO capstone ${i + 1}`) },
      { name: 'specification', value: () => text('DEMO specification') }, { name: 'architecture', value: () => text('DEMO architecture') },
      { name: 'verification_plan', value: () => text('DEMO verification plan') }, { name: 'evidence_json', value: () => JSON.stringify({ demo: true }) },
      { name: 'status', value: () => 'in-review' }, { name: 'score', value: (i) => 70 + i % 25 }, { name: 'feedback', value: () => text('DEMO feedback') },
      { name: 'created_at', value: () => now }, { name: 'updated_at', value: () => now }] },
    academy_tutor_messages: { columns: 'id, tenant_id, user_id, topic_slug, question, response_json, model, created_at', values: [
      { name: 'id', value: (i) => `demo-tutor-${i + 1}` }, { name: 'tenant_id', value: () => tenants[0] },
      { name: 'user_id', value: (i) => `demo-user-${(i % 4) + 1}` }, { name: 'topic_slug', value: (i) => `demo-topic-${i + 1}` },
      { name: 'question', value: (i) => text(`DEMO question ${i + 1}`) }, { name: 'response_json', value: () => JSON.stringify({ demo: true }) },
      { name: 'model', value: () => 'demo' }, { name: 'created_at', value: () => now }] },
  };
  return spec[table];
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
      const spec = postgresRows(tablename);
      if (!spec) {
        console.log(`  ${tablename}: ${current} rows (no demo template; left as-is)`);
        continue;
      }
      const ids = new Set<string>();
      for (let index = current; index < TARGET; index += 1) {
        const values = spec.values.map((column) => column.value(index));
        const id = values[0] as string;
        if (ids.has(id)) continue;
        ids.add(id);
        const placeholders = spec.values.map((_, position) => `$${position + 1}`).join(', ');
        await pool.query(
          `INSERT INTO "${tablename}" (${spec.values.map((column) => column.name).join(', ')})
           VALUES (${placeholders}) ON CONFLICT (id) DO NOTHING`,
          values,
        );
      }
      const after = Number((await pool.query(`SELECT COUNT(*)::int AS c FROM "${tablename}"`)).rows[0].c);
      result[tablename] = after;
      console.log(`  ${tablename}: ${current} → ${after}`);
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
    throw new Error(`PostgreSQL tables below ${TARGET}: ${under.map(([table, count]) => `${table}=${count}`).join(', ')}`);
  }
  console.log(`All PostgreSQL tables have at least ${TARGET} rows.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
