/**
 * Regression tests for the "seeded data is invisible" bugs:
 *   1. The trainer only read `openlane_runs`, so persisted `ml_samples`
 *      (demo/pre-computed) were ignored and every target looked untrainable.
 *   2. Run-history/leaderboard tables were never seeded, so those workspaces
 *      stayed empty.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';

const dbPath = path.join(os.tmpdir(), `ml-fallback-${process.pid}-${Date.now()}.db`);
process.env.CHIP_DB_PATH = dbPath;

const { getRawDb } = require('@/lib/db/connection') as typeof import('@/lib/db/connection');
const store = require('@/lib/ml/store') as typeof import('@/lib/ml/store');
const { availableTargets, collectTrainingSamples } = require('@/lib/ml/trainFromRuns') as typeof import('@/lib/ml/trainFromRuns');

function seedStoredSamples(target: string, count: number) {
  const samples = Array.from({ length: count }, (_, index) => ({
    target,
    features: { clockPeriodNs: 8 + index, coreUtilization: 40, targetDensity: 0.6, dieAreaUm2: 800_000, aspectRatio: 1.1, cellCount: 5_000 + index * 100, netCount: 6_000 + index * 100, maxRoutingLayer: 5, synthDelayStrategy: 1, nodeNm: 130 },
    label: 100_000 + index * 1_000,
    source: 'stored_samples' as const,
    sourceId: `seed-${index}`,
  }));
  store.saveSamples(samples);
}

describe('ML trainer sample sources', () => {
  beforeAll(() => {
    const db = getRawDb();
    // Core tables so the connection is usable; ml_* are created by ensureMlSchema.
    db.exec(`
      CREATE TABLE IF NOT EXISTS openlane_designs (id TEXT PRIMARY KEY, name TEXT NOT NULL, rtl TEXT NOT NULL DEFAULT '', ports_json TEXT NOT NULL DEFAULT '[]', clocks_json TEXT NOT NULL DEFAULT '[]', config_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS openlane_runs (id TEXT PRIMARY KEY, design_id TEXT NOT NULL, tag TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'running', config_json TEXT NOT NULL DEFAULT '{}', stages_json TEXT NOT NULL DEFAULT '[]', metrics_json TEXT NOT NULL DEFAULT '{}', layout_json TEXT NOT NULL DEFAULT '{}', total_runtime_ms INTEGER NOT NULL DEFAULT 0, started_at TEXT NOT NULL, finished_at TEXT);
    `);
    store.ensureMlSchema(db);
  });

  afterAll(() => {
    try {
      fs.rmSync(dbPath, { force: true });
    } catch {
      /* best effort */
    }
  });

  it('falls back to persisted ml_samples when no OpenLane run exposes the target metric', () => {
    seedStoredSamples('wirelength', 12);
    const collected = collectTrainingSamples('wirelength');
    expect(collected.samples).toHaveLength(12);
    expect(collected.sources).toContain('stored_samples');
    expect(collected.storedSampleCount).toBe(12);
    expect(collected.runsConsidered).toBe(0);
  });

  it('reports the target as available via its stored samples', () => {
    const target = availableTargets().find((entry) => entry.target === 'wirelength');
    expect(target?.available).toBe(true);
    expect(target?.storedSampleCount).toBeGreaterThanOrEqual(12);
    expect(target?.runSampleCount).toBe(0);
  });

  it('prefers real OpenLane run rows when they expose the metric', () => {
    const db = getRawDb();
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO openlane_runs (id, design_id, tag, status, config_json, stages_json, metrics_json, layout_json, total_runtime_ms, started_at, finished_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      'run-real-1',
      'design-1',
      'tag',
      'finished',
      JSON.stringify({ CLOCK_PERIOD: 10, CELL_COUNT: 5000, NET_COUNT: 6000 }),
      '[]',
      JSON.stringify({ 'routing__wirelength': 250_000 }),
      '{}',
      1000,
      now,
      now,
    );
    const collected = collectTrainingSamples('wirelength');
    expect(collected.sources).toEqual(['openlane_runs']);
    expect(collected.samples.some((sample) => sample.runId === 'run-real-1')).toBe(true);
    expect(collected.storedSampleCount).toBe(0);
  });
});

describe('demo loader coverage', () => {
  it('seeds run-history tables in addition to analog and ML tables', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'scripts', 'load-demo-data.ts'), 'utf8');
    // The loader must write to every table the workspaces read from.
    for (const table of ['analog_projects', 'analog_runs', 'ml_samples', 'ml_models', 'openlane_runs', 'algorithm_runs']) {
      expect(source).toContain(table);
    }
    expect(source).toMatch(/INSERT INTO openlane_runs/);
    expect(source).toMatch(/INSERT INTO algorithm_runs/);
  });
});
