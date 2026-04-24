/**
 * Public data-access layer.
 *
 * The public shape (`users.list`, `sessions.getByToken`, ...) is preserved
 * from the previous in-memory DB so callers don't need to change. Under the
 * hood it now runs against a SQLite database via Drizzle + better-sqlite3.
 *
 * Everything stays synchronous because better-sqlite3 is sync.
 */

import { eq } from 'drizzle-orm';
import type {
  User, Session, AuditLog, PasswordReset, EmailVerification,
  ErrorLogEntry, Role, QueryOptions, PaginatedResult,
} from './types';
import { getDb } from './connection';
import * as schema from './schema';
import { queryCollection } from './query';

// ---------------------------------------------------------------------------
// Row <-> domain-object mapping
// ---------------------------------------------------------------------------

type UserRow = typeof schema.users.$inferSelect;
type SessionRow = typeof schema.sessions.$inferSelect;
type AuditLogRow = typeof schema.auditLogs.$inferSelect;
type PasswordResetRow = typeof schema.passwordResets.$inferSelect;
type EmailVerificationRow = typeof schema.emailVerifications.$inferSelect;
type ErrorLogRow = typeof schema.errorLogs.$inferSelect;
type RoleRow = typeof schema.roles.$inferSelect;

const rowToUser = (r: UserRow): User => ({
  id: r.id,
  email: r.email,
  name: r.name,
  passwordHash: r.passwordHash,
  role: r.role as User['role'],
  status: r.status as User['status'],
  emailVerified: !!r.emailVerified,
  avatar: r.avatar ?? undefined,
  lastLoginAt: r.lastLoginAt ?? undefined,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
});

const rowToSession = (r: SessionRow): Session => ({
  id: r.id, userId: r.userId, token: r.token,
  userAgent: r.userAgent, ipAddress: r.ipAddress,
  browser: r.browser, os: r.os,
  active: !!r.active, expiresAt: r.expiresAt, createdAt: r.createdAt,
});

const rowToAudit = (r: AuditLogRow): AuditLog => ({
  id: r.id, userId: r.userId, userName: r.userName,
  action: r.action as AuditLog['action'],
  resource: r.resource, resourceId: r.resourceId ?? undefined,
  details: r.details, ipAddress: r.ipAddress, createdAt: r.createdAt,
});

const rowToPwReset = (r: PasswordResetRow): PasswordReset => ({
  id: r.id, userId: r.userId, userEmail: r.userEmail, token: r.token,
  status: r.status as PasswordReset['status'],
  expiresAt: r.expiresAt, usedAt: r.usedAt ?? undefined,
  createdAt: r.createdAt,
});

const rowToEmailVer = (r: EmailVerificationRow): EmailVerification => ({
  id: r.id, userId: r.userId, userEmail: r.userEmail, token: r.token,
  status: r.status as EmailVerification['status'],
  verifiedAt: r.verifiedAt ?? undefined,
  expiresAt: r.expiresAt, createdAt: r.createdAt,
});

const rowToErrorLog = (r: ErrorLogRow): ErrorLogEntry => ({
  id: r.id, message: r.message,
  stack: r.stack ?? undefined,
  endpoint: r.endpoint ?? undefined,
  method: r.method ?? undefined,
  statusCode: r.statusCode ?? undefined,
  userId: r.userId ?? undefined,
  context: r.contextJson ? safeJsonParse(r.contextJson) : undefined,
  severity: r.severity as ErrorLogEntry['severity'],
  resolved: !!r.resolved,
  resolvedAt: r.resolvedAt ?? undefined,
  createdAt: r.createdAt,
});

const rowToRole = (r: RoleRow): Role => ({
  id: r.id, name: r.name as Role['name'],
  displayName: r.displayName, description: r.description,
  permissions: safeJsonParse(r.permissionsJson) ?? [],
  userCount: r.userCount,
  createdAt: r.createdAt, updatedAt: r.updatedAt,
});

function safeJsonParse(s: string): any {
  try { return JSON.parse(s); } catch { return null; }
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export const users = {
  list: (options?: QueryOptions): PaginatedResult<Omit<User, 'passwordHash'>> => {
    const rows = getDb().select().from(schema.users).all();
    const all = rows.map(rowToUser);
    const page = queryCollection(all, options);
    return {
      ...page,
      data: page.data.map(({ passwordHash, ...rest }) => rest) as any,
    };
  },
  getById: (id: string): User | undefined => {
    const r = getDb().select().from(schema.users).where(eq(schema.users.id, id)).get();
    return r ? rowToUser(r) : undefined;
  },
  getByEmail: (email: string): User | undefined => {
    const r = getDb().select().from(schema.users).where(eq(schema.users.email, email)).get();
    return r ? rowToUser(r) : undefined;
  },
  create: (user: User): User => {
    getDb().insert(schema.users).values({
      ...user,
      emailVerified: user.emailVerified,
      avatar: user.avatar ?? null,
      lastLoginAt: user.lastLoginAt ?? null,
    }).run();
    return user;
  },
  update: (id: string, updates: Partial<User>): User | null => {
    const now = new Date().toISOString();
    const patch: Record<string, any> = { ...updates, updatedAt: now };
    if ('emailVerified' in updates) patch.emailVerified = updates.emailVerified;
    getDb().update(schema.users).set(patch).where(eq(schema.users.id, id)).run();
    return users.getById(id) ?? null;
  },
  delete: (id: string): boolean => {
    const res = getDb().delete(schema.users).where(eq(schema.users.id, id)).run();
    return (res.changes ?? 0) > 0;
  },
  count: (): number => {
    const r = getDb().select().from(schema.users).all();
    return r.length;
  },
};

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export const sessions = {
  list: (options?: QueryOptions): PaginatedResult<Session> => {
    const all = getDb().select().from(schema.sessions).all().map(rowToSession);
    return queryCollection(all, options);
  },
  getById: (id: string): Session | undefined => {
    const r = getDb().select().from(schema.sessions).where(eq(schema.sessions.id, id)).get();
    return r ? rowToSession(r) : undefined;
  },
  getByToken: (token: string): Session | undefined => {
    const r = getDb().select().from(schema.sessions).where(eq(schema.sessions.token, token)).get();
    return r ? rowToSession(r) : undefined;
  },
  getByUserId: (userId: string): Session[] => {
    return getDb().select().from(schema.sessions).where(eq(schema.sessions.userId, userId)).all().map(rowToSession);
  },
  create: (session: Session): Session => {
    getDb().insert(schema.sessions).values({ ...session, active: session.active }).run();
    return session;
  },
  update: (id: string, updates: Partial<Session>): Session | null => {
    const patch: Record<string, any> = { ...updates };
    if ('active' in updates) patch.active = updates.active;
    getDb().update(schema.sessions).set(patch).where(eq(schema.sessions.id, id)).run();
    return sessions.getById(id) ?? null;
  },
  delete: (id: string): boolean => {
    const res = getDb().delete(schema.sessions).where(eq(schema.sessions.id, id)).run();
    return (res.changes ?? 0) > 0;
  },
  invalidateUserSessions: (userId: string): void => {
    getDb().update(schema.sessions).set({ active: false }).where(eq(schema.sessions.userId, userId)).run();
  },
  count: (): number => getDb().select().from(schema.sessions).all().length,
};

// ---------------------------------------------------------------------------
// Audit logs
// ---------------------------------------------------------------------------

export const auditLogs = {
  list: (options?: QueryOptions): PaginatedResult<AuditLog> => {
    const all = getDb().select().from(schema.auditLogs).all().map(rowToAudit);
    return queryCollection(all, options);
  },
  getById: (id: string): AuditLog | undefined => {
    const r = getDb().select().from(schema.auditLogs).where(eq(schema.auditLogs.id, id)).get();
    return r ? rowToAudit(r) : undefined;
  },
  create: (log: AuditLog): AuditLog => {
    getDb().insert(schema.auditLogs).values({ ...log, resourceId: log.resourceId ?? null }).run();
    return log;
  },
  count: (): number => getDb().select().from(schema.auditLogs).all().length,
};

// ---------------------------------------------------------------------------
// Password resets
// ---------------------------------------------------------------------------

export const passwordResets = {
  list: (options?: QueryOptions): PaginatedResult<PasswordReset> => {
    const all = getDb().select().from(schema.passwordResets).all().map(rowToPwReset);
    return queryCollection(all, options);
  },
  getById: (id: string): PasswordReset | undefined => {
    const r = getDb().select().from(schema.passwordResets).where(eq(schema.passwordResets.id, id)).get();
    return r ? rowToPwReset(r) : undefined;
  },
  getByToken: (token: string): PasswordReset | undefined => {
    const r = getDb().select().from(schema.passwordResets).where(eq(schema.passwordResets.token, token)).get();
    return r ? rowToPwReset(r) : undefined;
  },
  create: (reset: PasswordReset): PasswordReset => {
    getDb().insert(schema.passwordResets).values({ ...reset, usedAt: reset.usedAt ?? null }).run();
    return reset;
  },
  update: (id: string, updates: Partial<PasswordReset>): PasswordReset | null => {
    getDb().update(schema.passwordResets).set({ ...updates }).where(eq(schema.passwordResets.id, id)).run();
    return passwordResets.getById(id) ?? null;
  },
  count: (): number => getDb().select().from(schema.passwordResets).all().length,
};

// ---------------------------------------------------------------------------
// Email verifications
// ---------------------------------------------------------------------------

export const emailVerifications = {
  list: (options?: QueryOptions): PaginatedResult<EmailVerification> => {
    const all = getDb().select().from(schema.emailVerifications).all().map(rowToEmailVer);
    return queryCollection(all, options);
  },
  getById: (id: string): EmailVerification | undefined => {
    const r = getDb().select().from(schema.emailVerifications).where(eq(schema.emailVerifications.id, id)).get();
    return r ? rowToEmailVer(r) : undefined;
  },
  getByToken: (token: string): EmailVerification | undefined => {
    const r = getDb().select().from(schema.emailVerifications).where(eq(schema.emailVerifications.token, token)).get();
    return r ? rowToEmailVer(r) : undefined;
  },
  getByUserId: (userId: string): EmailVerification | undefined => {
    const r = getDb().select().from(schema.emailVerifications).where(eq(schema.emailVerifications.userId, userId)).get();
    return r ? rowToEmailVer(r) : undefined;
  },
  create: (verification: EmailVerification): EmailVerification => {
    getDb().insert(schema.emailVerifications).values({
      ...verification,
      verifiedAt: verification.verifiedAt ?? null,
    }).run();
    return verification;
  },
  update: (id: string, updates: Partial<EmailVerification>): EmailVerification | null => {
    getDb().update(schema.emailVerifications).set({ ...updates }).where(eq(schema.emailVerifications.id, id)).run();
    return emailVerifications.getById(id) ?? null;
  },
  count: (): number => getDb().select().from(schema.emailVerifications).all().length,
};

// ---------------------------------------------------------------------------
// Error logs
// ---------------------------------------------------------------------------

export const errorLogs = {
  list: (options?: QueryOptions): PaginatedResult<ErrorLogEntry> => {
    const all = getDb().select().from(schema.errorLogs).all().map(rowToErrorLog);
    return queryCollection(all, options);
  },
  getById: (id: string): ErrorLogEntry | undefined => {
    const r = getDb().select().from(schema.errorLogs).where(eq(schema.errorLogs.id, id)).get();
    return r ? rowToErrorLog(r) : undefined;
  },
  create: (log: ErrorLogEntry): ErrorLogEntry => {
    getDb().insert(schema.errorLogs).values({
      ...log,
      stack: log.stack ?? null,
      endpoint: log.endpoint ?? null,
      method: log.method ?? null,
      statusCode: log.statusCode ?? null,
      userId: log.userId ?? null,
      contextJson: log.context ? JSON.stringify(log.context) : null,
      resolved: log.resolved,
      resolvedAt: log.resolvedAt ?? null,
    }).run();
    return log;
  },
  update: (id: string, updates: Partial<ErrorLogEntry>): ErrorLogEntry | null => {
    const patch: Record<string, any> = { ...updates };
    if ('context' in updates) patch.contextJson = updates.context ? JSON.stringify(updates.context) : null;
    delete patch.context;
    getDb().update(schema.errorLogs).set(patch).where(eq(schema.errorLogs.id, id)).run();
    return errorLogs.getById(id) ?? null;
  },
  count: (): number => getDb().select().from(schema.errorLogs).all().length,
};

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

export const roles = {
  list: (options?: QueryOptions): PaginatedResult<Role> => {
    const all = getDb().select().from(schema.roles).all().map(rowToRole);
    return queryCollection(all, options);
  },
  getById: (id: string): Role | undefined => {
    const r = getDb().select().from(schema.roles).where(eq(schema.roles.id, id)).get();
    return r ? rowToRole(r) : undefined;
  },
  getByName: (name: string): Role | undefined => {
    const r = getDb().select().from(schema.roles).where(eq(schema.roles.name, name)).get();
    return r ? rowToRole(r) : undefined;
  },
  update: (id: string, updates: Partial<Role>): Role | null => {
    const now = new Date().toISOString();
    const patch: Record<string, any> = { ...updates, updatedAt: now };
    if ('permissions' in updates) {
      patch.permissionsJson = JSON.stringify(updates.permissions ?? []);
      delete patch.permissions;
    }
    getDb().update(schema.roles).set(patch).where(eq(schema.roles.id, id)).run();
    return roles.getById(id) ?? null;
  },
  count: (): number => getDb().select().from(schema.roles).all().length,
};

// ---------------------------------------------------------------------------
// Designs (new)
// ---------------------------------------------------------------------------

import type { Cell, Net, Wire } from '@/types/algorithms';

export interface Design {
  id: string;
  ownerId: string;
  name: string;
  description: string;
  cells: Cell[];
  nets: Net[];
  wires: Wire[];
  verilog?: string;
  sdc?: string;
  createdAt: string;
  updatedAt: string;
}

const rowToDesign = (r: typeof schema.designs.$inferSelect): Design => ({
  id: r.id, ownerId: r.ownerId, name: r.name, description: r.description,
  cells: safeJsonParse(r.cellsJson) ?? [],
  nets:  safeJsonParse(r.netsJson)  ?? [],
  wires: safeJsonParse(r.wiresJson) ?? [],
  verilog: r.verilog ?? undefined,
  sdc: r.sdc ?? undefined,
  createdAt: r.createdAt, updatedAt: r.updatedAt,
});

export const designs = {
  list: (ownerId?: string): Design[] => {
    const q = getDb().select().from(schema.designs);
    const rows = ownerId ? q.where(eq(schema.designs.ownerId, ownerId)).all() : q.all();
    return rows.map(rowToDesign);
  },
  getById: (id: string): Design | undefined => {
    const r = getDb().select().from(schema.designs).where(eq(schema.designs.id, id)).get();
    return r ? rowToDesign(r) : undefined;
  },
  create: (d: Omit<Design, 'createdAt' | 'updatedAt'>): Design => {
    const now = new Date().toISOString();
    const full: Design = { ...d, createdAt: now, updatedAt: now };
    getDb().insert(schema.designs).values({
      id: full.id,
      ownerId: full.ownerId,
      name: full.name,
      description: full.description,
      cellsJson: JSON.stringify(full.cells),
      netsJson: JSON.stringify(full.nets),
      wiresJson: JSON.stringify(full.wires),
      verilog: full.verilog ?? null,
      sdc: full.sdc ?? null,
      createdAt: now, updatedAt: now,
    }).run();
    return full;
  },
  update: (id: string, updates: Partial<Design>): Design | null => {
    const patch: Record<string, any> = { updatedAt: new Date().toISOString() };
    if (updates.name !== undefined) patch.name = updates.name;
    if (updates.description !== undefined) patch.description = updates.description;
    if (updates.cells !== undefined) patch.cellsJson = JSON.stringify(updates.cells);
    if (updates.nets !== undefined) patch.netsJson = JSON.stringify(updates.nets);
    if (updates.wires !== undefined) patch.wiresJson = JSON.stringify(updates.wires);
    if (updates.verilog !== undefined) patch.verilog = updates.verilog;
    if (updates.sdc !== undefined) patch.sdc = updates.sdc;
    getDb().update(schema.designs).set(patch).where(eq(schema.designs.id, id)).run();
    return designs.getById(id) ?? null;
  },
  delete: (id: string): boolean => {
    const res = getDb().delete(schema.designs).where(eq(schema.designs.id, id)).run();
    return (res.changes ?? 0) > 0;
  },
  count: (): number => getDb().select().from(schema.designs).all().length,
};

// ---------------------------------------------------------------------------
// Algorithm runs (new)
// ---------------------------------------------------------------------------

export interface AlgorithmRun {
  id: string;
  designId?: string;
  userId?: string;
  category: string;
  algorithm: string;
  parameters: Record<string, any>;
  result: Record<string, any>;
  runtimeMs: number;
  success: boolean;
  createdAt: string;
}

const rowToRun = (r: typeof schema.algorithmRuns.$inferSelect): AlgorithmRun => ({
  id: r.id,
  designId: r.designId ?? undefined,
  userId: r.userId ?? undefined,
  category: r.category,
  algorithm: r.algorithm,
  parameters: safeJsonParse(r.parametersJson) ?? {},
  result: safeJsonParse(r.resultJson) ?? {},
  runtimeMs: r.runtimeMs,
  success: !!r.success,
  createdAt: r.createdAt,
});

export const algorithmRuns = {
  list: (): AlgorithmRun[] =>
    getDb().select().from(schema.algorithmRuns).all().map(rowToRun),
  byDesign: (designId: string): AlgorithmRun[] =>
    getDb().select().from(schema.algorithmRuns)
      .where(eq(schema.algorithmRuns.designId, designId)).all().map(rowToRun),
  create: (r: Omit<AlgorithmRun, 'createdAt'>): AlgorithmRun => {
    const full: AlgorithmRun = { ...r, createdAt: new Date().toISOString() };
    getDb().insert(schema.algorithmRuns).values({
      id: full.id,
      designId: full.designId ?? null,
      userId: full.userId ?? null,
      category: full.category,
      algorithm: full.algorithm,
      parametersJson: JSON.stringify(full.parameters),
      resultJson: JSON.stringify(full.result),
      runtimeMs: full.runtimeMs,
      success: full.success,
      createdAt: full.createdAt,
    }).run();
    return full;
  },
  count: (): number => getDb().select().from(schema.algorithmRuns).all().length,
};

// ---------------------------------------------------------------------------
// OpenLane simulation (Phase 1)
// ---------------------------------------------------------------------------

export interface OpenlanePort   { name: string; direction: 'input' | 'output' | 'inout'; }
export interface OpenlaneClock  { name: string; periodNs: number; }
export interface OpenlaneDesign {
  id: string;
  name: string;
  rtl: string;
  ports: OpenlanePort[];
  clocks: OpenlaneClock[];
  config: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface OpenlaneStageReport {
  stage: string;
  status: 'success' | 'warn' | 'fail';
  runtimeMs: number;
  logLines: string[];
  /** key = report file path, value = raw .rpt contents. */
  reportRpts: Record<string, string>;
  metrics: Record<string, number | string>;
}

/** Geometric layout snapshot the viewer renders. */
export interface OpenlaneLayout {
  chipWidth: number;
  chipHeight: number;
  cells: Array<{
    id: string; name: string; type: string;
    x: number; y: number; width: number; height: number;
  }>;
  wires: Array<{
    id: string; netId: string; layer: number;
    points: Array<{ x: number; y: number }>;
  }>;
}

export interface OpenlaneRun {
  id: string;
  designId: string;
  tag: string;
  status: 'running' | 'success' | 'failed';
  config: Record<string, any>;
  stages: OpenlaneStageReport[];
  metrics: Record<string, number | string>;
  layout: OpenlaneLayout;
  totalRuntimeMs: number;
  startedAt: string;
  finishedAt: string | null;
}

const rowToOpenlaneDesign = (r: typeof schema.openlaneDesigns.$inferSelect): OpenlaneDesign => ({
  id: r.id,
  name: r.name,
  rtl: r.rtl,
  ports: safeJsonParse(r.portsJson) ?? [],
  clocks: safeJsonParse(r.clocksJson) ?? [],
  config: safeJsonParse(r.configJson) ?? {},
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
});

const rowToOpenlaneRun = (r: typeof schema.openlaneRuns.$inferSelect): OpenlaneRun => ({
  id: r.id,
  designId: r.designId,
  tag: r.tag,
  status: r.status as OpenlaneRun['status'],
  config: safeJsonParse(r.configJson) ?? {},
  stages: safeJsonParse(r.stagesJson) ?? [],
  metrics: safeJsonParse(r.metricsJson) ?? {},
  layout: ((): OpenlaneLayout => {
    // Runs persisted before the layout schema existed (or with a corrupt
    // layoutJson) can produce `{}` here. Fill any missing fields so downstream
    // `.map`/`.length` calls don't throw.
    const raw = safeJsonParse(r.layoutJson) as Partial<OpenlaneLayout> | null;
    return {
      chipWidth: raw?.chipWidth ?? 0,
      chipHeight: raw?.chipHeight ?? 0,
      cells: raw?.cells ?? [],
      wires: raw?.wires ?? [],
    };
  })(),
  totalRuntimeMs: r.totalRuntimeMs,
  startedAt: r.startedAt,
  finishedAt: r.finishedAt ?? null,
});

export const openlaneDesigns = {
  list: (): OpenlaneDesign[] =>
    getDb().select().from(schema.openlaneDesigns).all().map(rowToOpenlaneDesign),
  get: (id: string): OpenlaneDesign | null => {
    const r = getDb().select().from(schema.openlaneDesigns)
      .where(eq(schema.openlaneDesigns.id, id)).get();
    return r ? rowToOpenlaneDesign(r) : null;
  },
  create: (d: Omit<OpenlaneDesign, 'createdAt' | 'updatedAt'>): OpenlaneDesign => {
    const now = new Date().toISOString();
    const full: OpenlaneDesign = { ...d, createdAt: now, updatedAt: now };
    getDb().insert(schema.openlaneDesigns).values({
      id: full.id,
      name: full.name,
      rtl: full.rtl,
      portsJson: JSON.stringify(full.ports),
      clocksJson: JSON.stringify(full.clocks),
      configJson: JSON.stringify(full.config),
      createdAt: now,
      updatedAt: now,
    }).run();
    return full;
  },
  update: (id: string, patch: Partial<Omit<OpenlaneDesign, 'id' | 'createdAt'>>): OpenlaneDesign | null => {
    const current = openlaneDesigns.get(id);
    if (!current) return null;
    const merged: OpenlaneDesign = { ...current, ...patch, updatedAt: new Date().toISOString() };
    getDb().update(schema.openlaneDesigns).set({
      name: merged.name,
      rtl: merged.rtl,
      portsJson: JSON.stringify(merged.ports),
      clocksJson: JSON.stringify(merged.clocks),
      configJson: JSON.stringify(merged.config),
      updatedAt: merged.updatedAt,
    }).where(eq(schema.openlaneDesigns.id, id)).run();
    return merged;
  },
  /** Delete a design. Returns true if a row was removed. Callers should
   *  cascade runs separately via `openlaneRuns.deleteByDesign(id)`. */
  delete: (id: string): boolean => {
    const res = getDb().delete(schema.openlaneDesigns)
      .where(eq(schema.openlaneDesigns.id, id)).run();
    return (res.changes ?? 0) > 0;
  },
  count: (): number => getDb().select().from(schema.openlaneDesigns).all().length,
};

export const openlaneRuns = {
  list: (): OpenlaneRun[] =>
    getDb().select().from(schema.openlaneRuns).all().map(rowToOpenlaneRun),
  byDesign: (designId: string): OpenlaneRun[] =>
    getDb().select().from(schema.openlaneRuns)
      .where(eq(schema.openlaneRuns.designId, designId)).all().map(rowToOpenlaneRun),
  get: (id: string): OpenlaneRun | null => {
    const r = getDb().select().from(schema.openlaneRuns)
      .where(eq(schema.openlaneRuns.id, id)).get();
    return r ? rowToOpenlaneRun(r) : null;
  },
  create: (r: Omit<OpenlaneRun, 'startedAt' | 'finishedAt'> & { startedAt?: string }): OpenlaneRun => {
    const startedAt = r.startedAt ?? new Date().toISOString();
    const full: OpenlaneRun = { ...r, startedAt, finishedAt: null };
    getDb().insert(schema.openlaneRuns).values({
      id: full.id,
      designId: full.designId,
      tag: full.tag,
      status: full.status,
      configJson: JSON.stringify(full.config),
      stagesJson: JSON.stringify(full.stages),
      metricsJson: JSON.stringify(full.metrics),
      layoutJson: JSON.stringify(full.layout),
      totalRuntimeMs: full.totalRuntimeMs,
      startedAt,
      finishedAt: null,
    }).run();
    return full;
  },
  finalize: (id: string, patch: {
    status: OpenlaneRun['status'];
    stages: OpenlaneStageReport[];
    metrics: Record<string, number | string>;
    layout: OpenlaneLayout;
    totalRuntimeMs: number;
  }): OpenlaneRun | null => {
    const finishedAt = new Date().toISOString();
    getDb().update(schema.openlaneRuns).set({
      status: patch.status,
      stagesJson: JSON.stringify(patch.stages),
      metricsJson: JSON.stringify(patch.metrics),
      layoutJson: JSON.stringify(patch.layout),
      totalRuntimeMs: patch.totalRuntimeMs,
      finishedAt,
    }).where(eq(schema.openlaneRuns.id, id)).run();
    return openlaneRuns.get(id);
  },
  delete: (id: string): boolean => {
    const res = getDb().delete(schema.openlaneRuns)
      .where(eq(schema.openlaneRuns.id, id)).run();
    return (res.changes ?? 0) > 0;
  },
  /** Cascade helper: remove every run that belongs to a design. */
  deleteByDesign: (designId: string): number => {
    const res = getDb().delete(schema.openlaneRuns)
      .where(eq(schema.openlaneRuns.designId, designId)).run();
    return res.changes ?? 0;
  },
  count: (): number => getDb().select().from(schema.openlaneRuns).all().length,
};

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

export function getDbStats() {
  return {
    users: users.count(),
    sessions: sessions.count(),
    auditLogs: auditLogs.count(),
    passwordResets: passwordResets.count(),
    emailVerifications: emailVerifications.count(),
    errorLogs: errorLogs.count(),
    roles: roles.count(),
    designs: designs.count(),
    algorithmRuns: algorithmRuns.count(),
    openlaneDesigns: openlaneDesigns.count(),
    openlaneRuns: openlaneRuns.count(),
  };
}
