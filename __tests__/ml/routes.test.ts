/** @jest-environment node */
/**
 * Route-handler integration tests for /api/ml/{status,predict,train} against a
 * throwaway SQLite file (CHIP_DB_PATH). `server-only` is mocked because Jest
 * does not run the React Server Component condition.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'chip-ml-routes-'));
process.env.CHIP_DB_PATH = path.join(temporaryDirectory, 'ml-routes.sqlite3');

jest.mock('server-only', () => ({}));

import { getRawDb } from '@/lib/db/connection';
import { ensureMlSchema } from '@/lib/ml/store';
import { GET as getStatus } from '../../app/api/ml/status/route';
import { POST as postPredict } from '../../app/api/ml/predict/route';
import { POST as postTrain } from '../../app/api/ml/train/route';

function createIdentity(role: 'admin' | 'editor' | 'viewer'): string {
  const raw = getRawDb();
  const now = new Date().toISOString();
  const token = `token-${role}-${Date.now()}`;
  raw.prepare(`
    INSERT INTO users (id, tenant_id, email, name, password_hash, role, status,
      email_verified, avatar, last_login_at, created_at, updated_at)
    VALUES (?, 'ml-tenant', ?, ?, 'hash', ?, 'active', 1, NULL, NULL, ?, ?)
  `).run(`user-${role}`, `${role}@ml.test`, role, role, now, now);
  raw.prepare(`
    INSERT INTO sessions (id, user_id, token, user_agent, ip_address, browser, os, active, expires_at, created_at)
    VALUES (?, ?, ?, 'jest', '127.0.0.1', 'test', 'test', 1, ?, ?)
  `).run(`session-${role}`, `user-${role}`, token, new Date(Date.now() + 3_600_000).toISOString(), now);
  return token;
}

function seedAreaRuns(count = 10): void {
  const raw = getRawDb();
  for (let i = 0; i < count; i++) {
    const cellCount = 20 + i * 5;
    raw.prepare(`
      INSERT INTO openlane_runs
        (id, design_id, tag, status, config_json, stages_json, metrics_json, layout_json,
         total_runtime_ms, started_at, finished_at)
      VALUES (?, 'design-1', ?, 'success', ?, '[]', ?, ?, 900, ?, ?)
    `).run(
      `run-${i}`,
      `RUN_${i}`,
      JSON.stringify({
        CLOCK_PERIOD: 10, FP_CORE_UTIL: 0.5, PL_TARGET_DENSITY: 0.55,
        DIE_AREA_X: 1000, DIE_AREA_Y: 1000, CELL_COUNT: cellCount, NET_COUNT: cellCount * 2,
        RT_MAX_LAYER: 'met5', SYNTH_STRATEGY: 'AREA 0', PDK: 'sky130A',
      }),
      JSON.stringify({ synthesis__area: 100 + 4 * cellCount + 0.25 * i, synthesis__power: 2 + 0.1 * cellCount }),
      JSON.stringify({ chipWidth: 1000, chipHeight: 1000, cells: [] }),
      '2026-01-01T00:00:00.000Z',
      '2026-01-01T00:01:00.000Z',
    );
  }
}

function postJson(url: string, body: unknown, token?: string): Request {
  return new Request(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { cookie: `auth-token=${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

beforeAll(() => {
  ensureMlSchema(getRawDb());
});

beforeEach(() => {
  const raw = getRawDb();
  raw.exec('DELETE FROM ml_samples; DELETE FROM ml_models; DELETE FROM openlane_runs; DELETE FROM sessions; DELETE FROM users;');
});

afterAll(() => {
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
});

describe('GET /api/ml/status', () => {
  it('reports targets, samples and stored models', async () => {
    seedAreaRuns(3);
    const response = await getStatus();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.minTrainingSamples).toBe(8);
    const area = body.targets.find((target: { target: string }) => target.target === 'area');
    expect(area).toMatchObject({ sampleCount: 3, available: true });
    expect(body.samples).toEqual({ total: 0, byTarget: {} });
    expect(body.models).toEqual([]);
  });
});

describe('POST /api/ml/predict', () => {
  it('answers 422 for schema violations and 404 for unknown models', async () => {
    expect((await postPredict(postJson('http://localhost/api/ml/predict', {}))).status).toBe(422);
    expect((await postPredict(postJson('http://localhost/api/ml/predict', {
      modelId: 'missing', config: {},
    }))).status).toBe(404);
    expect((await postPredict(postJson('http://localhost/api/ml/predict', {
      modelId: 'a', target: 'area', config: {},
    }))).status).toBe(422);
  });

  it('returns a prediction with uncertainty and insufficientData', async () => {
    seedAreaRuns(4);
    // Fewer than MIN_TRAINING_SAMPLES runs — training still works, but flags it.
    const editorToken = createIdentity('editor');
    const trainResponse = await postTrain(postJson('http://localhost/api/ml/train', {
      target: 'area', options: { seed: 1 },
    }, editorToken));
    expect(trainResponse.status).toBe(200);

    const predictResponse = await postPredict(postJson('http://localhost/api/ml/predict', {
      target: 'area',
      config: { CLOCK_PERIOD: 10, CELL_COUNT: 50, DIE_AREA_X: 1000, DIE_AREA_Y: 1000 },
    }));
    expect(predictResponse.status).toBe(200);
    const body = await predictResponse.json();
    expect(Number.isFinite(body.prediction.value)).toBe(true);
    expect(body.prediction.uncertainty).toBeGreaterThanOrEqual(0);
    expect(body.prediction.insufficientData).toBe(true);
    expect(body.features.cell_count).toBe(50);
    expect(body.model.target).toBe('area');
  });
});

describe('POST /api/ml/train', () => {
  it('requires authentication', async () => {
    seedAreaRuns(3);
    const response = await postTrain(postJson('http://localhost/api/ml/train', { target: 'area' }));
    expect(response.status).toBe(401);
  });

  it('forbids viewers', async () => {
    seedAreaRuns(3);
    const viewerToken = createIdentity('viewer');
    const response = await postTrain(postJson('http://localhost/api/ml/train', { target: 'area' }, viewerToken));
    expect(response.status).toBe(403);
  });

  it('returns 422 for invalid options', async () => {
    const editorToken = createIdentity('editor');
    const response = await postTrain(postJson('http://localhost/api/ml/train', {
      target: 'area', options: { learningRate: -1 },
    }, editorToken));
    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.details.fieldErrors.options).toBeDefined();
  });

  it('trains from stored runs for editors and admins', async () => {
    seedAreaRuns(12);
    const editorToken = createIdentity('editor');
    const response = await postTrain(postJson('http://localhost/api/ml/train', {
      target: 'area', options: { name: 'route-trained', seed: 2 },
    }, editorToken));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.model.name).toBe('route-trained');
    expect(body.model.sampleCount).toBe(12);
    expect(body.metrics.r2).toBeGreaterThan(0.9);
    expect(body.insufficientData).toBe(false);
    expect(body.runsConsidered).toBe(12);
  });

  it('returns a readable error when the target has no stored columns', async () => {
    const editorToken = createIdentity('editor');
    const response = await postTrain(postJson('http://localhost/api/ml/train', {
      target: 'wirelength',
    }, editorToken));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.message).toContain('No usable samples for ML target "wirelength"');
    expect(body.message).toContain('Available metric columns');
  });
});
