/** @jest-environment node */
/**
 * trainFromRuns tests against a throwaway SQLite file. The tests seed their
 * own `openlane_runs` rows — no real database is touched.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'chip-ml-runs-'));
process.env.CHIP_DB_PATH = path.join(temporaryDirectory, 'ml-runs.sqlite3');

import { getRawDb } from '@/lib/db/connection';
import { countSamples, ensureMlSchema, listModels, listSamples } from '@/lib/ml/store';
import {
  ML_TARGETS,
  availableTargets,
  collectTrainingSamples,
  trainFromRuns,
} from '@/lib/ml/trainFromRuns';

interface SeedRun {
  id: string;
  cellCount: number;
  area?: number;
  power?: number;
}

function insertRun(run: SeedRun): void {
  getRawDb().prepare(`
    INSERT INTO openlane_runs
      (id, design_id, tag, status, config_json, stages_json, metrics_json, layout_json,
       total_runtime_ms, started_at, finished_at)
    VALUES (?, ?, ?, 'success', ?, '[]', ?, ?, 1200, ?, ?)
  `).run(
    run.id,
    'design-1',
    `RUN_${run.id}`,
    JSON.stringify({
      CLOCK_PERIOD: 10,
      FP_CORE_UTIL: 0.5,
      PL_TARGET_DENSITY: 0.55,
      DIE_AREA_X: 1000,
      DIE_AREA_Y: 1000,
      CELL_COUNT: run.cellCount,
      NET_COUNT: run.cellCount * 2,
      RT_MAX_LAYER: 'met5',
      SYNTH_STRATEGY: 'AREA 0',
      PDK: 'sky130A',
    }),
    JSON.stringify({
      ...(run.area !== undefined ? { synthesis__area: run.area } : {}),
      ...(run.power !== undefined ? { synthesis__power: run.power } : {}),
      'sta_post__wns__corner:tt_025C_1v80': 5 - run.cellCount * 0.1,
    }),
    JSON.stringify({ chipWidth: 1000, chipHeight: 1000, cells: [] }),
    '2026-01-01T00:00:00.000Z',
    '2026-01-01T00:01:00.000Z',
  );
}

function seedAreaRuns(count = 12): void {
  for (let i = 0; i < count; i++) {
    const cellCount = 20 + i * 5;
    insertRun({
      id: `run-${String(i).padStart(3, '0')}`,
      cellCount,
      area: 100 + 4 * cellCount + 0.5 * i,
      power: 2 + 0.3 * cellCount,
    });
  }
}

beforeAll(() => {
  ensureMlSchema(getRawDb());
});

beforeEach(() => {
  const raw = getRawDb();
  raw.exec('DELETE FROM ml_samples; DELETE FROM ml_models; DELETE FROM openlane_runs;');
});

afterAll(() => {
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
});

describe('availableTargets', () => {
  it('reports zero samples for every known target on an empty database', () => {
    const targets = availableTargets();
    expect(targets.map(target => target.target)).toEqual(ML_TARGETS.map(target => target.target));
    expect(targets.every(target => target.sampleCount === 0 && target.available === false)).toBe(true);
  });

  it('counts samples per target from stored run metrics', () => {
    seedAreaRuns(5);
    const area = availableTargets().find(target => target.target === 'area');
    const power = availableTargets().find(target => target.target === 'power');
    const wirelength = availableTargets().find(target => target.target === 'wirelength');
    expect(area).toMatchObject({ sampleCount: 5, available: true });
    expect(power).toMatchObject({ sampleCount: 5, available: true });
    expect(wirelength).toMatchObject({ sampleCount: 0, available: false });
  });
});

describe('collectTrainingSamples', () => {
  it('builds features and labels from the stored config/metrics columns', () => {
    seedAreaRuns(4);
    const collected = collectTrainingSamples('area');
    expect(collected.runsConsidered).toBe(4);
    expect(collected.runsSkipped).toBe(0);
    expect(collected.samples).toHaveLength(4);
    expect(collected.samples[0]).toMatchObject({ label: 100 + 4 * 20, metricKey: 'synthesis__area' });
    expect(collected.samples[0].features.clock_period_ns).toBe(10);
    expect(collected.samples[0].features.cell_count).toBe(20);
    expect(collected.availableMetricColumns).toContain('synthesis__power');
  });

  it('skips runs that lack the target metric key', () => {
    insertRun({ id: 'power-only', cellCount: 30, power: 9 });
    const collected = collectTrainingSamples('area');
    expect(collected.runsConsidered).toBe(1);
    expect(collected.samples).toHaveLength(0);
    expect(collected.runsSkipped).toBe(1);
  });
});

describe('trainFromRuns', () => {
  it('fails with a clear error when no runs are stored, listing available columns', () => {
    expect(() => trainFromRuns({ target: 'area' })).toThrow(/No usable samples for ML target "area"/);
    expect(() => trainFromRuns({ target: 'area' })).toThrow(/Available metric columns: \(no numeric metric columns found\)/);
  });

  it('rejects unknown targets and lists the known ones', () => {
    expect(() => trainFromRuns({ target: 'banana' })).toThrow(/Unknown ML target "banana"/);
    expect(() => trainFromRuns({ target: 'banana' })).toThrow(/area, power, slack, critical_path/);
  });

  it('lists the columns it did find when the requested target is absent', () => {
    insertRun({ id: 'power-only', cellCount: 30, power: 9 });
    let message = '';
    try {
      trainFromRuns({ target: 'area' });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toContain('synthesis__power');
    expect(message).toContain('sta_post__wns__corner:tt_025C_1v80');
    expect(message).toContain('openlane_runs rows expose');
  });

  it('trains, persists the model and stores its samples', () => {
    seedAreaRuns(12);
    const result = trainFromRuns({ target: 'area', options: { name: 'area-from-runs', seed: 3 }, createdBy: 'tester' });

    expect(result.model.name).toBe('area-from-runs');
    expect(result.model.target).toBe('area');
    expect(result.model.source).toBe('openlane_runs');
    expect(result.model.createdBy).toBe('tester');
    expect(result.model.sampleCount).toBe(12);
    expect(result.model.metrics.r2).toBeGreaterThan(0.9);
    expect(result.insufficientData).toBe(false);
    expect(result.sampleCount).toBe(12);
    expect(result.runsConsidered).toBe(12);
    expect(result.runsSkipped).toBe(0);

    const stored = listModels({ target: 'area' });
    expect(stored.map(model => model.id)).toContain(result.model.id);
    expect(stored[0].weights).toEqual(result.model.weights);

    const samples = listSamples({ target: 'area', modelId: result.model.id });
    expect(samples).toHaveLength(12);
    expect(samples[0].source).toBe('openlane_runs');
    expect(samples[0].sourceId).toMatch(/^run-/);
    expect(countSamples()).toEqual({ total: 12, byTarget: { area: 12 } });
  });

  it('flags insufficientData when fewer than the documented minimum runs exist', () => {
    seedAreaRuns(3);
    const result = trainFromRuns({ target: 'area', options: { seed: 1 } });
    expect(result.model.sampleCount).toBe(3);
    expect(result.insufficientData).toBe(true);
  });
});
