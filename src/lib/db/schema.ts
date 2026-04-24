/**
 * Drizzle schema for the SQLite-backed persistent store.
 *
 * Arrays / nested objects are JSON-encoded into TEXT columns to stay within
 * SQLite's type system without resorting to a relational decomposition the
 * existing API layer doesn't need.
 */

import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id:              text('id').primaryKey(),
  email:           text('email').notNull().unique(),
  name:            text('name').notNull(),
  passwordHash:    text('password_hash').notNull(),
  role:            text('role').notNull(),
  status:          text('status').notNull(),
  emailVerified:   integer('email_verified', { mode: 'boolean' }).notNull().default(false),
  avatar:          text('avatar'),
  lastLoginAt:     text('last_login_at'),
  createdAt:       text('created_at').notNull(),
  updatedAt:       text('updated_at').notNull(),
});

export const sessions = sqliteTable('sessions', {
  id:         text('id').primaryKey(),
  userId:     text('user_id').notNull(),
  token:      text('token').notNull(),
  userAgent:  text('user_agent').notNull(),
  ipAddress:  text('ip_address').notNull(),
  browser:    text('browser').notNull(),
  os:         text('os').notNull(),
  active:     integer('active', { mode: 'boolean' }).notNull().default(true),
  expiresAt:  text('expires_at').notNull(),
  createdAt:  text('created_at').notNull(),
});

export const auditLogs = sqliteTable('audit_logs', {
  id:          text('id').primaryKey(),
  userId:      text('user_id').notNull(),
  userName:    text('user_name').notNull(),
  action:      text('action').notNull(),
  resource:    text('resource').notNull(),
  resourceId:  text('resource_id'),
  details:     text('details').notNull(),
  ipAddress:   text('ip_address').notNull(),
  createdAt:   text('created_at').notNull(),
});

export const passwordResets = sqliteTable('password_resets', {
  id:         text('id').primaryKey(),
  userId:     text('user_id').notNull(),
  userEmail:  text('user_email').notNull(),
  token:      text('token').notNull(),
  status:     text('status').notNull(),
  expiresAt:  text('expires_at').notNull(),
  usedAt:     text('used_at'),
  createdAt:  text('created_at').notNull(),
});

export const emailVerifications = sqliteTable('email_verifications', {
  id:         text('id').primaryKey(),
  userId:     text('user_id').notNull(),
  userEmail:  text('user_email').notNull(),
  token:      text('token').notNull(),
  status:     text('status').notNull(),
  verifiedAt: text('verified_at'),
  expiresAt:  text('expires_at').notNull(),
  createdAt:  text('created_at').notNull(),
});

export const errorLogs = sqliteTable('error_logs', {
  id:          text('id').primaryKey(),
  message:     text('message').notNull(),
  stack:       text('stack'),
  endpoint:    text('endpoint'),
  method:      text('method'),
  statusCode:  integer('status_code'),
  userId:      text('user_id'),
  /** JSON-encoded Record<string, unknown>. */
  contextJson: text('context_json'),
  severity:    text('severity').notNull(),
  resolved:    integer('resolved', { mode: 'boolean' }).notNull().default(false),
  resolvedAt:  text('resolved_at'),
  createdAt:   text('created_at').notNull(),
});

export const roles = sqliteTable('roles', {
  id:              text('id').primaryKey(),
  name:            text('name').notNull(),
  displayName:     text('display_name').notNull(),
  description:     text('description').notNull(),
  /** JSON-encoded string[]. */
  permissionsJson: text('permissions_json').notNull().default('[]'),
  userCount:       integer('user_count').notNull().default(0),
  createdAt:       text('created_at').notNull(),
  updatedAt:       text('updated_at').notNull(),
});

// --- New tables the in-memory DB didn't have, to support multi-user designs ---

/** A chip design that users can create / modify / run algorithms against. */
export const designs = sqliteTable('designs', {
  id:          text('id').primaryKey(),
  ownerId:     text('owner_id').notNull(),
  name:        text('name').notNull(),
  description: text('description').notNull().default(''),
  /** JSON-encoded Cell[]. */
  cellsJson:   text('cells_json').notNull().default('[]'),
  /** JSON-encoded Net[]. */
  netsJson:    text('nets_json').notNull().default('[]'),
  /** JSON-encoded Wire[]. */
  wiresJson:   text('wires_json').notNull().default('[]'),
  /** Original Verilog source if imported. */
  verilog:     text('verilog'),
  /** SDC source if provided. */
  sdc:         text('sdc'),
  createdAt:   text('created_at').notNull(),
  updatedAt:   text('updated_at').notNull(),
});

/** OpenLane-simulation design.  Captures the same inputs a real
 *  OpenLane run would take (`DESIGN_NAME`, RTL, clocks, ports). */
export const openlaneDesigns = sqliteTable('openlane_designs', {
  id:          text('id').primaryKey(),
  name:        text('name').notNull(),
  rtl:         text('rtl').notNull().default(''),
  /** JSON-encoded { name, direction } port list. */
  portsJson:   text('ports_json').notNull().default('[]'),
  /** JSON-encoded { name, periodNs } clock list. */
  clocksJson:  text('clocks_json').notNull().default('[]'),
  /** JSON-encoded config.json knobs (CLOCK_PERIOD, FP_CORE_UTIL, …). */
  configJson:  text('config_json').notNull().default('{}'),
  createdAt:   text('created_at').notNull(),
  updatedAt:   text('updated_at').notNull(),
});

/** One OpenLane-style flow run: synthesis → floorplan → placement →
 *  cts → routing → sta → drc → lvs → antenna → signoff. */
export const openlaneRuns = sqliteTable('openlane_runs', {
  id:             text('id').primaryKey(),
  designId:       text('design_id').notNull(),
  /** Human tag, e.g. `RUN_2026-04-21_13-45-02`. */
  tag:            text('tag').notNull(),
  /** running | success | failed. */
  status:         text('status').notNull().default('running'),
  /** JSON-encoded config snapshot at time of run. */
  configJson:     text('config_json').notNull().default('{}'),
  /** JSON-encoded StageReport[] (per stage: name, status, runtimeMs,
   *  logLines[], reportRpts{path:content}, metricsJson). */
  stagesJson:     text('stages_json').notNull().default('[]'),
  /** Aggregated OpenLane-style metrics.json. */
  metricsJson:    text('metrics_json').notNull().default('{}'),
  /** JSON-encoded layout { chipWidth, chipHeight, cells, wires }
   *  for the viewer tab. */
  layoutJson:     text('layout_json').notNull().default('{}'),
  totalRuntimeMs: integer('total_runtime_ms').notNull().default(0),
  startedAt:      text('started_at').notNull(),
  finishedAt:     text('finished_at'),
});

/** Every algorithm run is recorded so the RL retraining pipeline (future
 *  work) has a persistent history to learn from. */
export const algorithmRuns = sqliteTable('algorithm_runs', {
  id:            text('id').primaryKey(),
  designId:      text('design_id'),
  userId:        text('user_id'),
  category:      text('category').notNull(),
  algorithm:     text('algorithm').notNull(),
  /** JSON parameters the user passed in. */
  parametersJson: text('parameters_json').notNull().default('{}'),
  /** JSON result object returned by the runner. */
  resultJson:    text('result_json').notNull().default('{}'),
  runtimeMs:     integer('runtime_ms').notNull().default(0),
  success:       integer('success', { mode: 'boolean' }).notNull().default(true),
  createdAt:     text('created_at').notNull(),
});
