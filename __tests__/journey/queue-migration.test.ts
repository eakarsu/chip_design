/** @jest-environment node */
import Database from 'better-sqlite3';
import { ensureEdaSchema, validateEdaSchema } from '@/lib/eda/store';

it('migrates the legacy two-tool CHECK without losing jobs, artifacts, indexes or foreign keys', () => {
  const template = new Database(':memory:');
  ensureEdaSchema(template);
  const tables = template
    .prepare("SELECT name,sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
    .all() as Array<{ name: string; sql: string }>;
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  for (const table of tables)
    db.exec(
      table.sql
        .replace("'yosys','openroad','simulation','formal'", "'yosys','openroad'")
        .replace(/\s*artifacts_expired_at TEXT,/, '')
    );
  db.exec("INSERT INTO eda_projects VALUES ('p','t','project','pdk','digest','license','user','2026-01-01')");
  db.exec(`INSERT INTO eda_jobs (id,tenant_id,project_id,user_id,kind,status,idempotency_key,request_hash,input_manifest_json,tool_image,pdk_digest,expected_cpu_seconds,next_attempt_at,retention_until,created_at,updated_at)
    VALUES ('j','t','p','user','yosys','succeeded','request-1','hash','{}','image','digest',30,'2026-01-01','2027-01-01','2026-01-01','2026-01-01')`);
  db.exec("INSERT INTO eda_artifacts VALUES ('a','j','t','netlist.json','json','checksum',2,'2026-01-01')");
  expect(() => validateEdaSchema(db)).toThrow();
  ensureEdaSchema(db);
  expect(() => validateEdaSchema(db)).not.toThrow();
  expect(db.prepare('SELECT kind FROM eda_jobs WHERE id=?').get('j')).toEqual({ kind: 'yosys' });
  expect(db.prepare('SELECT job_id FROM eda_artifacts WHERE id=?').get('a')).toEqual({ job_id: 'j' });
  expect(db.pragma('foreign_key_check')).toEqual([]);
  expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
  expect(() => db.prepare("UPDATE eda_jobs SET kind='formal' WHERE id='j'").run()).not.toThrow();
  expect(() => db.prepare("UPDATE eda_jobs SET kind='simulation' WHERE id='j'").run()).not.toThrow();
  ensureEdaSchema(db);
  expect(db.prepare('SELECT COUNT(*) AS n FROM eda_artifacts').get()).toEqual({ n: 1 });
  db.close();
  template.close();
});

it('backfills previously purged jobs from immutable audit events without expiring untouched jobs', () => {
  const db = new Database(':memory:');
  ensureEdaSchema(db);
  db.exec('DROP INDEX idx_eda_jobs_retention; ALTER TABLE eda_jobs DROP COLUMN artifacts_expired_at');
  db.exec("INSERT INTO eda_projects VALUES ('p','t','project','pdk','digest','license','user','2026-01-01')");
  for (const id of ['expired', 'untouched'])
    db.prepare(
      `INSERT INTO eda_jobs
    (id,tenant_id,project_id,user_id,kind,status,idempotency_key,request_hash,input_manifest_json,tool_image,pdk_digest,expected_cpu_seconds,next_attempt_at,retention_until,created_at,updated_at)
    VALUES (?,'t','p','user','yosys','cancelled',?,'hash','{}','image','digest',30,'2026-01-01','2026-02-01','2026-01-01','2026-03-01')`
    ).run(id, id);
  db.exec(`INSERT INTO eda_audit_events (tenant_id,job_id,actor_id,action,details_json,previous_hash,event_hash,created_at)
    VALUES ('t','expired','retention-sweeper','job.artifacts-expired','{}','previous','event','2026-02-02')`);
  const audit = db.prepare('SELECT * FROM eda_audit_events').all();
  expect(() => validateEdaSchema(db)).toThrow(/expiry/);
  ensureEdaSchema(db);
  ensureEdaSchema(db);
  expect(() => validateEdaSchema(db)).not.toThrow();
  expect(db.prepare('SELECT artifacts_expired_at FROM eda_jobs WHERE id=?').get('expired')).toEqual({
    artifacts_expired_at: '2026-02-02',
  });
  expect(db.prepare('SELECT artifacts_expired_at FROM eda_jobs WHERE id=?').get('untouched')).toEqual({
    artifacts_expired_at: null,
  });
  expect(db.prepare('SELECT * FROM eda_audit_events').all()).toEqual(audit);
  db.close();
});
