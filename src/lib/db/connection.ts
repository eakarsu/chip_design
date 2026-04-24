/**
 * Boots the persistent SQLite database, creates tables if missing, and
 * imports the existing in-memory seed on first run.
 *
 * The DB file defaults to `./data/chip_design.db`; override with
 * `CHIP_DB_PATH=...` or set `CHIP_DB_PATH=:memory:` for tests.
 */

import path from 'path';
import fs from 'fs';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';
import { getSeedData } from './seed';

type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

declare global {
  // eslint-disable-next-line no-var
  var __chipDb: DrizzleDb | undefined;
  // eslint-disable-next-line no-var
  var __chipDbRaw: Database.Database | undefined;
}

function resolveDbPath(): string {
  const explicit = process.env.CHIP_DB_PATH;
  if (explicit && explicit.length > 0) return explicit;
  return path.join(process.cwd(), 'data', 'chip_design.db');
}

function ensureTables(raw: Database.Database): void {
  // Drizzle doesn't auto-migrate — we keep the schema creation inline here
  // so the first launch after cloning the repo just works.
  raw.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL,
      status TEXT NOT NULL,
      email_verified INTEGER NOT NULL DEFAULT 0,
      avatar TEXT,
      last_login_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token TEXT NOT NULL,
      user_agent TEXT NOT NULL,
      ip_address TEXT NOT NULL,
      browser TEXT NOT NULL,
      os TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      user_name TEXT NOT NULL,
      action TEXT NOT NULL,
      resource TEXT NOT NULL,
      resource_id TEXT,
      details TEXT NOT NULL,
      ip_address TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id);

    CREATE TABLE IF NOT EXISTS password_resets (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      user_email TEXT NOT NULL,
      token TEXT NOT NULL,
      status TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS email_verifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      user_email TEXT NOT NULL,
      token TEXT NOT NULL,
      status TEXT NOT NULL,
      verified_at TEXT,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS error_logs (
      id TEXT PRIMARY KEY,
      message TEXT NOT NULL,
      stack TEXT,
      endpoint TEXT,
      method TEXT,
      status_code INTEGER,
      user_id TEXT,
      context_json TEXT,
      severity TEXT NOT NULL,
      resolved INTEGER NOT NULL DEFAULT 0,
      resolved_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS roles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      display_name TEXT NOT NULL,
      description TEXT NOT NULL,
      permissions_json TEXT NOT NULL DEFAULT '[]',
      user_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS designs (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      cells_json TEXT NOT NULL DEFAULT '[]',
      nets_json TEXT NOT NULL DEFAULT '[]',
      wires_json TEXT NOT NULL DEFAULT '[]',
      verilog TEXT,
      sdc TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS algorithm_runs (
      id TEXT PRIMARY KEY,
      design_id TEXT,
      user_id TEXT,
      category TEXT NOT NULL,
      algorithm TEXT NOT NULL,
      parameters_json TEXT NOT NULL DEFAULT '{}',
      result_json TEXT NOT NULL DEFAULT '{}',
      runtime_ms INTEGER NOT NULL DEFAULT 0,
      success INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_runs_design ON algorithm_runs(design_id);
    CREATE INDEX IF NOT EXISTS idx_runs_user ON algorithm_runs(user_id);

    CREATE TABLE IF NOT EXISTS openlane_designs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      rtl TEXT NOT NULL DEFAULT '',
      ports_json TEXT NOT NULL DEFAULT '[]',
      clocks_json TEXT NOT NULL DEFAULT '[]',
      config_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS openlane_runs (
      id TEXT PRIMARY KEY,
      design_id TEXT NOT NULL,
      tag TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'running',
      config_json TEXT NOT NULL DEFAULT '{}',
      stages_json TEXT NOT NULL DEFAULT '[]',
      metrics_json TEXT NOT NULL DEFAULT '{}',
      layout_json TEXT NOT NULL DEFAULT '{}',
      total_runtime_ms INTEGER NOT NULL DEFAULT 0,
      started_at TEXT NOT NULL,
      finished_at TEXT
    );
    -- Older DBs created before Phase 2 might exist without layout_json —
    -- ALTER in the column so the app keeps working after a schema bump.
    -- (SQLite doesn't have IF NOT EXISTS on ALTER; guard with pragma.)
    CREATE INDEX IF NOT EXISTS idx_openlane_runs_design ON openlane_runs(design_id);
  `);

  // Safe forward-migration for `openlane_runs.layout_json`.  A DB created
  // during Phase 1 (before the column existed) otherwise keeps working but
  // lacks the viewer data — add it in place rather than forcing a reset.
  try {
    const cols = raw.prepare(`PRAGMA table_info(openlane_runs)`).all() as Array<{ name: string }>;
    if (!cols.some(c => c.name === 'layout_json')) {
      raw.exec(`ALTER TABLE openlane_runs ADD COLUMN layout_json TEXT NOT NULL DEFAULT '{}'`);
    }
  } catch {
    // Table may not exist yet on a truly fresh DB — in that case the CREATE
    // above handled it with the correct schema.
  }
}

function seedIfEmpty(raw: Database.Database): void {
  const count = raw.prepare('SELECT COUNT(*) as n FROM users').get() as { n: number };
  if (count.n > 0) return;

  const seed = getSeedData();

  const insertMany = raw.transaction(() => {
    const insU = raw.prepare(`
      INSERT INTO users (id, email, name, password_hash, role, status,
        email_verified, avatar, last_login_at, created_at, updated_at)
      VALUES (@id, @email, @name, @passwordHash, @role, @status,
        @emailVerified, @avatar, @lastLoginAt, @createdAt, @updatedAt)
    `);
    for (const u of seed.users) {
      insU.run({
        ...u,
        emailVerified: u.emailVerified ? 1 : 0,
        avatar: u.avatar ?? null,
        lastLoginAt: u.lastLoginAt ?? null,
      });
    }

    const insS = raw.prepare(`
      INSERT INTO sessions (id, user_id, token, user_agent, ip_address,
        browser, os, active, expires_at, created_at)
      VALUES (@id, @userId, @token, @userAgent, @ipAddress, @browser, @os,
        @active, @expiresAt, @createdAt)
    `);
    for (const s of seed.sessions) insS.run({ ...s, active: s.active ? 1 : 0 });

    const insA = raw.prepare(`
      INSERT INTO audit_logs (id, user_id, user_name, action, resource,
        resource_id, details, ip_address, created_at)
      VALUES (@id, @userId, @userName, @action, @resource, @resourceId,
        @details, @ipAddress, @createdAt)
    `);
    for (const a of seed.auditLogs) insA.run({ ...a, resourceId: a.resourceId ?? null });

    const insP = raw.prepare(`
      INSERT INTO password_resets (id, user_id, user_email, token, status,
        expires_at, used_at, created_at)
      VALUES (@id, @userId, @userEmail, @token, @status, @expiresAt,
        @usedAt, @createdAt)
    `);
    for (const p of seed.passwordResets) insP.run({ ...p, usedAt: p.usedAt ?? null });

    const insE = raw.prepare(`
      INSERT INTO email_verifications (id, user_id, user_email, token,
        status, verified_at, expires_at, created_at)
      VALUES (@id, @userId, @userEmail, @token, @status, @verifiedAt,
        @expiresAt, @createdAt)
    `);
    for (const e of seed.emailVerifications) insE.run({ ...e, verifiedAt: e.verifiedAt ?? null });

    const insL = raw.prepare(`
      INSERT INTO error_logs (id, message, stack, endpoint, method,
        status_code, user_id, context_json, severity, resolved,
        resolved_at, created_at)
      VALUES (@id, @message, @stack, @endpoint, @method, @statusCode,
        @userId, @contextJson, @severity, @resolved, @resolvedAt, @createdAt)
    `);
    for (const l of seed.errorLogs) insL.run({
      ...l,
      stack: l.stack ?? null,
      endpoint: l.endpoint ?? null,
      method: l.method ?? null,
      statusCode: l.statusCode ?? null,
      userId: l.userId ?? null,
      contextJson: l.context ? JSON.stringify(l.context) : null,
      resolved: l.resolved ? 1 : 0,
      resolvedAt: l.resolvedAt ?? null,
    });

    const insR = raw.prepare(`
      INSERT INTO roles (id, name, display_name, description,
        permissions_json, user_count, created_at, updated_at)
      VALUES (@id, @name, @displayName, @description, @permissionsJson,
        @userCount, @createdAt, @updatedAt)
    `);
    for (const r of seed.roles) insR.run({
      ...r,
      permissionsJson: JSON.stringify(r.permissions ?? []),
    });
  });

  insertMany();
}

export function getDb(): DrizzleDb {
  if (globalThis.__chipDb) return globalThis.__chipDb;

  const dbPath = resolveDbPath();
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const raw = new Database(dbPath);
  raw.pragma('journal_mode = WAL');
  raw.pragma('foreign_keys = ON');
  ensureTables(raw);
  seedIfEmpty(raw);

  const db = drizzle(raw, { schema });
  globalThis.__chipDb = db;
  globalThis.__chipDbRaw = raw;
  return db;
}

export function getRawDb(): Database.Database {
  if (!globalThis.__chipDbRaw) getDb();
  return globalThis.__chipDbRaw!;
}

/** Test helper: drop and recreate all tables. DO NOT call in production. */
export function resetDbForTests(): void {
  const raw = getRawDb();
  const tables = ['users', 'sessions', 'audit_logs', 'password_resets',
                  'email_verifications', 'error_logs', 'roles', 'designs',
                  'algorithm_runs'];
  const drop = raw.transaction(() => {
    for (const t of tables) raw.exec(`DROP TABLE IF EXISTS ${t}`);
  });
  drop();
  ensureTables(raw);
  seedIfEmpty(raw);
}
