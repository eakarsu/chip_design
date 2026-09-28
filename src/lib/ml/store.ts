/**
 * Persistence for trained ML surrogates and their training samples.
 *
 * Two additive tables (never touching the governed EDA schema):
 *
 *   ml_models  — one row per persisted {@link RidgeModel} + identity metadata.
 *   ml_samples — the exact (features, label) rows a model was trained on, so
 *                training data provenance stays auditable and re-trainable.
 *
 * Schema creation is idempotent and mirrors the pattern in
 * `src/lib/eda/store.ts`: ensure in dev/test, validate (fail with a clear
 * "run the migration" message) in production unless migrations are explicit.
 */

import { randomUUID } from 'crypto';
import type Database from 'better-sqlite3';
import { getRawDb } from '@/lib/db/connection';
import type { FeatureVector, RidgeModel, TrainingMetrics } from './surrogate';

export interface StoredMlModel extends RidgeModel {
  id: string;
  name: string;
  createdAt: string;
  createdBy?: string;
  /** Provenance, e.g. `openlane_runs`. */
  source: string;
}

export interface MlSampleInput {
  target: string;
  features: FeatureVector;
  label: number;
  modelId?: string;
  source?: string;
  sourceId?: string;
}

export interface StoredMlSample {
  id: string;
  modelId?: string;
  target: string;
  features: FeatureVector;
  label: number;
  source: string;
  sourceId?: string;
  createdAt: string;
}

interface ModelRow {
  id: string;
  name: string;
  target: string;
  feature_names_json: string;
  weights_json: string;
  intercept: number;
  feature_means_json: string;
  feature_stds_json: string;
  metrics_json: string;
  residual_std: number;
  sample_count: number;
  hyperparameters_json: string;
  source: string;
  created_by: string | null;
  created_at: string;
}

interface SampleRow {
  id: string;
  model_id: string | null;
  target: string;
  features_json: string;
  label: number;
  source: string;
  source_id: string | null;
  created_at: string;
}

interface CountRow {
  target: string;
  n: number;
}

/** Idempotently create the ML tables. Safe to call on every boot. */
export function ensureMlSchema(raw: Database.Database = getRawDb()): void {
  raw.exec(`
    CREATE TABLE IF NOT EXISTS ml_models (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      target TEXT NOT NULL,
      feature_names_json TEXT NOT NULL,
      weights_json TEXT NOT NULL,
      intercept REAL NOT NULL,
      feature_means_json TEXT NOT NULL,
      feature_stds_json TEXT NOT NULL,
      metrics_json TEXT NOT NULL DEFAULT '{}',
      residual_std REAL NOT NULL DEFAULT 0,
      sample_count INTEGER NOT NULL DEFAULT 0,
      hyperparameters_json TEXT NOT NULL DEFAULT '{}',
      source TEXT NOT NULL DEFAULT 'openlane_runs',
      created_by TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_ml_models_target ON ml_models(target, created_at DESC);

    CREATE TABLE IF NOT EXISTS ml_samples (
      id TEXT PRIMARY KEY,
      model_id TEXT,
      target TEXT NOT NULL,
      features_json TEXT NOT NULL,
      label REAL NOT NULL,
      source TEXT NOT NULL DEFAULT 'openlane_runs',
      source_id TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_ml_samples_target ON ml_samples(target, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_ml_samples_model ON ml_samples(model_id);
  `);
}

/** Production guard: refuse to auto-create tables, demand the migration. */
export function assertMlSchema(raw: Database.Database = getRawDb()): void {
  const required = ['ml_models', 'ml_samples'];
  const existing = new Set((raw.prepare(
    "SELECT name FROM sqlite_master WHERE type='table'",
  ).all() as Array<{ name: string }>).map(row => row.name));
  const missing = required.filter(table => !existing.has(table));
  if (missing.length) {
    throw new Error(`ML migration required; missing: ${missing.join(', ')}. Run npm run migrate.`);
  }
}

function database(): Database.Database {
  const raw = getRawDb();
  if (process.env.NODE_ENV === 'production' && process.env.CHIP_ALLOW_SCHEMA_MIGRATION !== 'true') {
    assertMlSchema(raw);
  } else {
    ensureMlSchema(raw);
  }
  return raw;
}

function parseJson<T>(source: string, fallback: T): T {
  try {
    return JSON.parse(source) as T;
  } catch {
    return fallback;
  }
}

function parseNumberArray(source: string): number[] {
  const parsed = parseJson<unknown>(source, []);
  return Array.isArray(parsed) ? parsed.filter((value): value is number => typeof value === 'number') : [];
}

function modelFromRow(row: ModelRow): StoredMlModel {
  return {
    id: row.id,
    name: row.name,
    target: row.target,
    featureNames: parseJson<string[]>(row.feature_names_json, []),
    weights: parseNumberArray(row.weights_json),
    intercept: row.intercept,
    featureMeans: parseNumberArray(row.feature_means_json),
    featureStds: parseNumberArray(row.feature_stds_json),
    residualStd: row.residual_std,
    sampleCount: row.sample_count,
    metrics: parseJson<TrainingMetrics>(row.metrics_json, {
      r2: 0, rmse: 0, mae: 0, epochs: 0, finalLoss: 0, sampleCount: 0, featureCount: 0,
    }),
    hyperparameters: parseJson<RidgeModel['hyperparameters']>(row.hyperparameters_json, {
      learningRate: 0, l2: 0, epochs: 0, tolerance: 0, seed: 0,
    }),
    source: row.source,
    createdBy: row.created_by ?? undefined,
    createdAt: row.created_at,
  };
}

function sampleFromRow(row: SampleRow): StoredMlSample {
  return {
    id: row.id,
    modelId: row.model_id ?? undefined,
    target: row.target,
    features: parseJson<FeatureVector>(row.features_json, {}),
    label: row.label,
    source: row.source,
    sourceId: row.source_id ?? undefined,
    createdAt: row.created_at,
  };
}

/** Insert or replace one model (same id overwrites). */
export function saveModel(model: StoredMlModel): void {
  database().prepare(`
    INSERT INTO ml_models
      (id, name, target, feature_names_json, weights_json, intercept,
       feature_means_json, feature_stds_json, metrics_json, residual_std,
       sample_count, hyperparameters_json, source, created_by, created_at)
    VALUES
      (@id, @name, @target, @featureNamesJson, @weightsJson, @intercept,
       @featureMeansJson, @featureStdsJson, @metricsJson, @residualStd,
       @sampleCount, @hyperparametersJson, @source, @createdBy, @createdAt)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      target = excluded.target,
      feature_names_json = excluded.feature_names_json,
      weights_json = excluded.weights_json,
      intercept = excluded.intercept,
      feature_means_json = excluded.feature_means_json,
      feature_stds_json = excluded.feature_stds_json,
      metrics_json = excluded.metrics_json,
      residual_std = excluded.residual_std,
      sample_count = excluded.sample_count,
      hyperparameters_json = excluded.hyperparameters_json,
      source = excluded.source,
      created_by = excluded.created_by,
      created_at = excluded.created_at
  `).run({
    id: model.id,
    name: model.name,
    target: model.target,
    featureNamesJson: JSON.stringify(model.featureNames),
    weightsJson: JSON.stringify(model.weights),
    intercept: model.intercept,
    featureMeansJson: JSON.stringify(model.featureMeans),
    featureStdsJson: JSON.stringify(model.featureStds),
    metricsJson: JSON.stringify(model.metrics),
    residualStd: model.residualStd,
    sampleCount: model.sampleCount,
    hyperparametersJson: JSON.stringify(model.hyperparameters),
    source: model.source,
    createdBy: model.createdBy ?? null,
    createdAt: model.createdAt,
  });
}

export function loadModel(id: string): StoredMlModel | undefined {
  const row = database().prepare('SELECT * FROM ml_models WHERE id = ?').get(id) as ModelRow | undefined;
  return row ? modelFromRow(row) : undefined;
}

export function latestModelForTarget(target: string): StoredMlModel | undefined {
  const row = database().prepare(
    'SELECT * FROM ml_models WHERE target = ? ORDER BY created_at DESC, id DESC LIMIT 1',
  ).get(target) as ModelRow | undefined;
  return row ? modelFromRow(row) : undefined;
}

export function listModels(options: { target?: string; limit?: number } = {}): StoredMlModel[] {
  const clauses: string[] = [];
  const params: Array<string | number> = [];
  if (options.target) {
    clauses.push('target = ?');
    params.push(options.target);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const limit = Number.isInteger(options.limit) && (options.limit ?? 0) > 0 ? `LIMIT ${Math.floor(options.limit!)}` : '';
  const rows = database().prepare(
    `SELECT * FROM ml_models ${where} ORDER BY created_at DESC, id DESC ${limit}`,
  ).all(...params) as ModelRow[];
  return rows.map(modelFromRow);
}

/** Delete a model and its samples in one transaction. */
export function deleteModel(id: string): boolean {
  const db = database();
  return db.transaction(() => {
    db.prepare('DELETE FROM ml_samples WHERE model_id = ?').run(id);
    const result = db.prepare('DELETE FROM ml_models WHERE id = ?').run(id);
    return result.changes > 0;
  })();
}

/** Persist training samples; returns the number of rows written. */
export function saveSamples(samples: MlSampleInput[], createdAt = new Date().toISOString()): number {
  if (samples.length === 0) return 0;
  const db = database();
  const insert = db.prepare(`
    INSERT INTO ml_samples (id, model_id, target, features_json, label, source, source_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const write = db.transaction((rows: MlSampleInput[]) => {
    let written = 0;
    for (const sample of rows) {
      insert.run(
        randomUUID(),
        sample.modelId ?? null,
        sample.target,
        JSON.stringify(sample.features),
        sample.label,
        sample.source ?? 'unknown',
        sample.sourceId ?? null,
        createdAt,
      );
      written++;
    }
    return written;
  });
  return write(samples);
}

export function listSamples(
  options: { target?: string; modelId?: string; limit?: number } = {},
): StoredMlSample[] {
  const clauses: string[] = [];
  const params: Array<string | number> = [];
  if (options.target) {
    clauses.push('target = ?');
    params.push(options.target);
  }
  if (options.modelId) {
    clauses.push('model_id = ?');
    params.push(options.modelId);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const limit = Number.isInteger(options.limit) && (options.limit ?? 0) > 0 ? `LIMIT ${Math.floor(options.limit!)}` : '';
  const rows = database().prepare(
    `SELECT * FROM ml_samples ${where} ORDER BY created_at, id ${limit}`,
  ).all(...params) as SampleRow[];
  return rows.map(sampleFromRow);
}

export function countSamples(): { total: number; byTarget: Record<string, number> } {
  const rows = database().prepare(
    'SELECT target, COUNT(*) AS n FROM ml_samples GROUP BY target ORDER BY target',
  ).all() as CountRow[];
  const byTarget: Record<string, number> = {};
  let total = 0;
  for (const row of rows) {
    byTarget[row.target] = row.n;
    total += row.n;
  }
  return { total, byTarget };
}
