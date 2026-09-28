/** @jest-environment node */
/**
 * Unit tests for the ridge-regression surrogate: convergence on synthetic
 * linear data, determinism, insufficient-data handling, feature extraction
 * with missing fields, and prediction monotonicity.
 */

import {
  FEATURE_NAMES,
  MIN_TRAINING_SAMPLES,
  extractFeatures,
  predict,
  trainRidge,
  type RidgeSample,
} from '@/lib/ml/surrogate';

/** Deterministic LCG so the "random" synthetic data is reproducible. */
function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function linearSamples(count: number, seed = 7): RidgeSample[] {
  const random = createRandom(seed);
  const samples: RidgeSample[] = [];
  for (let i = 0; i < count; i++) {
    const clockPeriod = 2 + random() * 8;
    const utilization = 0.3 + random() * 0.5;
    const density = 0.4 + random() * 0.4;
    const cellCount = 10 + Math.floor(random() * 90);
    const label = 12 + 3.5 * clockPeriod + 8 * utilization - 2.5 * density + 0.4 * cellCount;
    samples.push({
      features: {
        clock_period_ns: clockPeriod,
        core_utilization: utilization,
        place_density: density,
        cell_count: cellCount,
      },
      label,
    });
  }
  return samples;
}

const SYNTHETIC_FEATURES = ['clock_period_ns', 'core_utilization', 'place_density', 'cell_count'];

describe('trainRidge', () => {
  it('converges to R² > 0.95 on synthetic linear data', () => {
    const samples = linearSamples(90);
    const model = trainRidge(samples, {
      target: 'cost',
      featureNames: SYNTHETIC_FEATURES,
      l2: 0.001,
      seed: 11,
    });
    expect(model.metrics.r2).toBeGreaterThan(0.95);
    expect(model.metrics.rmse).toBeGreaterThanOrEqual(0);
    expect(model.sampleCount).toBe(90);
    expect(model.featureNames).toEqual(SYNTHETIC_FEATURES);
    expect(model.weights).toHaveLength(SYNTHETIC_FEATURES.length);
    expect(Number.isFinite(model.intercept)).toBe(true);
    expect(model.metrics.epochs).toBeGreaterThan(0);
  });

  it('produces identical weights for identical data and seed', () => {
    const samples = linearSamples(60, 3);
    const first = trainRidge(samples, { featureNames: SYNTHETIC_FEATURES, seed: 42 });
    const second = trainRidge(samples, { featureNames: SYNTHETIC_FEATURES, seed: 42 });
    expect(second.weights).toEqual(first.weights);
    expect(second.intercept).toBe(first.intercept);
    expect(second.featureMeans).toEqual(first.featureMeans);
    expect(second.featureStds).toEqual(first.featureStds);
    expect(second.metrics.finalLoss).toBe(first.metrics.finalLoss);
  });

  it('learns positive slope directions that match the generating model', () => {
    const model = trainRidge(linearSamples(80, 5), {
      featureNames: SYNTHETIC_FEATURES,
      seed: 1,
    });
    // clock, utilization and cell_count enter with positive coefficients;
    // density enters negatively.
    expect(model.weights[0]).toBeGreaterThan(0);
    expect(model.weights[1]).toBeGreaterThan(0);
    expect(model.weights[2]).toBeLessThan(0);
    expect(model.weights[3]).toBeGreaterThan(0);
  });

  it('rejects empty or invalid training inputs', () => {
    expect(() => trainRidge([])).toThrow(/at least one sample/i);
    expect(() => trainRidge(linearSamples(10), { learningRate: 0 })).toThrow(/learningRate/);
    expect(() => trainRidge(linearSamples(10), { epochs: 0 })).toThrow(/epochs/);
    expect(() => trainRidge([{ features: { x: 1 }, label: Number.NaN }])).toThrow(/finite/);
  });
});

describe('predict', () => {
  it('predicts near the training mean at the feature means', () => {
    const samples = linearSamples(70, 9);
    const model = trainRidge(samples, { featureNames: SYNTHETIC_FEATURES, seed: 2 });
    const meanLabel = samples.reduce((total, sample) => total + sample.label, 0) / samples.length;
    const atMeans = predict(model, {
      clock_period_ns: model.featureMeans[0],
      core_utilization: model.featureMeans[1],
      place_density: model.featureMeans[2],
      cell_count: model.featureMeans[3],
    });
    expect(atMeans.value).toBeCloseTo(meanLabel, 1);
    expect(atMeans.uncertainty).toBe(model.residualStd);
    expect(atMeans.lower95).toBeLessThan(atMeans.value);
    expect(atMeans.upper95).toBeGreaterThan(atMeans.value);
  });

  it('flags insufficientData below the documented minimum', () => {
    const tiny = trainRidge(linearSamples(MIN_TRAINING_SAMPLES - 3, 4), {
      featureNames: SYNTHETIC_FEATURES,
    });
    expect(tiny.sampleCount).toBeLessThan(MIN_TRAINING_SAMPLES);
    expect(predict(tiny, { clock_period_ns: 5 }).insufficientData).toBe(true);

    const enough = trainRidge(linearSamples(MIN_TRAINING_SAMPLES + 4, 4), {
      featureNames: SYNTHETIC_FEATURES,
    });
    expect(predict(enough, { clock_period_ns: 5 }).insufficientData).toBe(false);
  });

  it('is monotonic in a feature with a positive learned weight', () => {
    const samples: RidgeSample[] = Array.from({ length: 40 }, (_, i) => ({
      features: { x: i + 1 },
      label: 1 + 3 * (i + 1),
    }));
    const model = trainRidge(samples, { featureNames: ['x'], seed: 0 });
    expect(model.weights[0]).toBeGreaterThan(0);
    const low = predict(model, { x: 2 });
    const mid = predict(model, { x: 9 });
    const high = predict(model, { x: 25 });
    expect(mid.value).toBeGreaterThan(low.value);
    expect(high.value).toBeGreaterThan(mid.value);
  });

  it('treats missing prediction features as zero without throwing', () => {
    const model = trainRidge(linearSamples(30, 6), { featureNames: SYNTHETIC_FEATURES });
    const result = predict(model, {});
    expect(Number.isFinite(result.value)).toBe(true);
    expect(result.featureValues).toEqual([0, 0, 0, 0]);
  });
});

describe('extractFeatures', () => {
  it('returns every declared feature for an empty configuration', () => {
    const features = extractFeatures({});
    expect(Object.keys(features)).toEqual([...FEATURE_NAMES]);
    for (const name of FEATURE_NAMES) {
      expect(Number.isFinite(features[name])).toBe(true);
    }
    expect(features.clock_period_ns).toBe(0);
    // Neutral aspect ratio when no die dimensions are known.
    expect(features.aspect_ratio).toBe(1);
  });

  it('reads OpenLane config knobs and derives geometry', () => {
    const features = extractFeatures({
      CLOCK_PERIOD: 8,
      FP_CORE_UTIL: 0.45,
      PL_TARGET_DENSITY: 0.6,
      DIE_AREA_X: 100,
      DIE_AREA_Y: 50,
      CELL_COUNT: 25,
      NET_COUNT: 30,
      RT_MAX_LAYER: 'met4',
      SYNTH_STRATEGY: 'DELAY 1',
      PDK: 'gf180mcuC',
    });
    expect(features.clock_period_ns).toBe(8);
    expect(features.core_utilization).toBeCloseTo(0.45);
    expect(features.place_density).toBeCloseTo(0.6);
    expect(features.die_width_um).toBe(100);
    expect(features.die_height_um).toBe(50);
    expect(features.die_area_um2).toBe(5000);
    expect(features.aspect_ratio).toBe(2);
    expect(features.cell_count).toBe(25);
    expect(features.net_count).toBe(30);
    expect(features.routing_max_layer).toBe(4);
    expect(features.synth_strategy_delay).toBe(1);
    expect(features.pdk_node_nm).toBe(180);
  });

  it('falls back to metrics and layout snapshots', () => {
    const features = extractFeatures({
      config: {},
      metrics: { 'sta_pre__clock_period_ns': 6 },
      layout: { chipWidth: 200, chipHeight: 100, cells: [{}, {}, {}] },
    });
    expect(features.clock_period_ns).toBe(6);
    expect(features.die_width_um).toBe(200);
    expect(features.die_height_um).toBe(100);
    expect(features.cell_count).toBe(3);
  });

  it('ignores null, NaN, Infinity and non-numeric values safely', () => {
    const features = extractFeatures({
      CLOCK_PERIOD: 'not-a-number',
      FP_CORE_UTIL: Number.NaN,
      PL_TARGET_DENSITY: null,
      DIE_AREA_X: Number.POSITIVE_INFINITY,
      DIE_AREA_Y: -10,
      CELL_COUNT: '12',
      NET_COUNT: {},
    });
    expect(features.clock_period_ns).toBe(0);
    expect(features.core_utilization).toBe(0);
    expect(features.place_density).toBe(0);
    expect(features.die_width_um).toBe(0);
    expect(features.die_area_um2).toBe(0);
    expect(features.cell_count).toBe(12);
    expect(features.net_count).toBe(0);
    for (const name of FEATURE_NAMES) {
      expect(Number.isFinite(features[name])).toBe(true);
    }
  });
});
