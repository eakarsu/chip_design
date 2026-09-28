/** @jest-environment node */
/**
 * Store round-trip tests against a throwaway SQLite file. Never touches a
 * real database: CHIP_DB_PATH is pointed at a temp directory created here.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'chip-ml-store-'));
process.env.CHIP_DB_PATH = path.join(temporaryDirectory, 'ml-store.sqlite3');

import { getRawDb } from '@/lib/db/connection';
import { trainRidge, type RidgeSample } from '@/lib/ml/surrogate';
import {
  countSamples,
  deleteModel,
  ensureMlSchema,
  latestModelForTarget,
  listModels,
  listSamples,
  loadModel,
  saveModel,
  saveSamples,
  type StoredMlModel,
} from '@/lib/ml/store';

const FEATURES = ['clock_period_ns', 'cell_count'];

function trainedModel(): StoredMlModel {
  const samples: RidgeSample[] = Array.from({ length: 24 }, (_, i) => ({
    features: { clock_period_ns: 2 + (i % 8), cell_count: 10 + i * 3 },
    label: 5 + 1.5 * (2 + (i % 8)) + 0.25 * (10 + i * 3),
  }));
  return {
    ...trainRidge(samples, { target: 'area', featureNames: FEATURES, seed: 5 }),
    id: 'model-round-trip',
    name: 'area-v1',
    createdAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'tester',
    source: 'unit-test',
  };
}

beforeAll(() => {
  ensureMlSchema(getRawDb());
});

beforeEach(() => {
  const raw = getRawDb();
  raw.exec('DELETE FROM ml_samples; DELETE FROM ml_models;');
});

afterAll(() => {
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
});

describe('ensureMlSchema', () => {
  it('creates the ML tables idempotently', () => {
    ensureMlSchema(getRawDb());
    ensureMlSchema(getRawDb());
    const tables = (getRawDb().prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'ml_%' ORDER BY name",
    ).all() as Array<{ name: string }>).map(row => row.name);
    expect(tables).toEqual(['ml_models', 'ml_samples']);
  });
});

describe('model and sample persistence', () => {
  it('round-trips a trained model', () => {
    const model = trainedModel();
    saveModel(model);

    const loaded = loadModel(model.id);
    expect(loaded).toEqual(model);
    expect(listModels()).toHaveLength(1);
    expect(latestModelForTarget('area')?.id).toBe(model.id);
    expect(latestModelForTarget('power')).toBeUndefined();
  });

  it('upserts a model with the same id instead of duplicating it', () => {
    const model = trainedModel();
    saveModel(model);
    saveModel({ ...model, name: 'area-v2' });
    const models = listModels();
    expect(models).toHaveLength(1);
    expect(models[0].name).toBe('area-v2');
  });

  it('round-trips samples and counts them per target', () => {
    const model = trainedModel();
    saveModel(model);
    const written = saveSamples([
      { target: 'area', modelId: model.id, features: { clock_period_ns: 4, cell_count: 30 }, label: 17.5, source: 'openlane_runs', sourceId: 'run-1' },
      { target: 'area', modelId: model.id, features: { clock_period_ns: 6, cell_count: 60 }, label: 27.5, source: 'openlane_runs', sourceId: 'run-2' },
      { target: 'power', features: { clock_period_ns: 4, cell_count: 30 }, label: 3.25, source: 'openlane_runs', sourceId: 'run-1' },
    ], '2026-01-02T00:00:00.000Z');
    expect(written).toBe(3);

    expect(countSamples()).toEqual({ total: 3, byTarget: { area: 2, power: 1 } });

    const areaSamples = listSamples({ target: 'area' });
    expect(areaSamples).toHaveLength(2);
    const first = areaSamples.find(sample => sample.sourceId === 'run-1');
    expect(first).toMatchObject({
      target: 'area',
      label: 17.5,
      source: 'openlane_runs',
      sourceId: 'run-1',
      createdAt: '2026-01-02T00:00:00.000Z',
    });
    expect(first?.features).toEqual({ clock_period_ns: 4, cell_count: 30 });
    expect(first?.modelId).toBe(model.id);

    expect(listSamples({ modelId: model.id })).toHaveLength(2);
    expect(listSamples({ limit: 1 })).toHaveLength(1);
  });

  it('deletes a model together with its samples', () => {
    const model = trainedModel();
    saveModel(model);
    saveSamples([
      { target: 'area', modelId: model.id, features: { clock_period_ns: 4, cell_count: 30 }, label: 17.5 },
    ]);
    expect(deleteModel(model.id)).toBe(true);
    expect(deleteModel(model.id)).toBe(false);
    expect(loadModel(model.id)).toBeUndefined();
    expect(countSamples()).toEqual({ total: 0, byTarget: {} });
  });
});
