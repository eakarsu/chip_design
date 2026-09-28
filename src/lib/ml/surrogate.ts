/**
 * Deterministic ridge-regression surrogate for OpenLane-style runs.
 *
 * What this is: a real (if small) supervised learner. It fits
 *
 *     ŷ = b + Σ_j w_j · (x_j − μ_j) / σ_j
 *
 * by full-batch gradient descent on the objective
 *
 *     J(w, b) = (1 / 2n) · Σ_i (ŷ_i − y_i)² + (λ / 2) · Σ_j w_j²
 *
 * where x is standardized per feature (μ, σ from the training set, σ = 1 for
 * constant columns) and only the slopes are regularized — the intercept is
 * not penalized. Everything is plain TypeScript: no Math.random, no external
 * ML library. A seeded mulberry32 PRNG shuffles the training order so the
 * same `(samples, options)` pair always produces bit-identical weights.
 *
 * Uncertainty: `residualStd` is the training residual standard deviation
 * (denominator n − 2, the usual simple-linear-regression convention). It is
 * carried on the model and returned by `predict` as a ±1σ proxy. When a model
 * was trained on fewer than {@link MIN_TRAINING_SAMPLES} samples, predictions
 * are flagged `insufficientData` so callers can refuse to trust them.
 */

/** Models trained on fewer samples than this are flagged `insufficientData`. */
export const MIN_TRAINING_SAMPLES = 8;

/**
 * Fixed, ordered feature set derived from an OpenLane run configuration /
 * metrics / layout. The order is part of the persisted model contract — never
 * reorder without re-training stored models.
 */
export const FEATURE_NAMES = [
  'clock_period_ns',
  'core_utilization',
  'place_density',
  'die_width_um',
  'die_height_um',
  'die_area_um2',
  'aspect_ratio',
  'cell_count',
  'net_count',
  'routing_max_layer',
  'synth_strategy_delay',
  'pdk_node_nm',
] as const;

export type FeatureName = (typeof FEATURE_NAMES)[number];

/** Feature name → numeric value. Missing/non-finite values are read as 0. */
export type FeatureVector = Record<string, number>;

export interface DesignFeatureSource {
  /** Flat OpenLane config.json knobs (CLOCK_PERIOD, FP_CORE_UTIL, …). */
  config?: Record<string, unknown> | null;
  /** Aggregated metrics.json values; only a few are used as fallbacks. */
  metrics?: Record<string, unknown> | null;
  /** Layout snapshot from `openlane_runs.layout_json`. */
  layout?: { chipWidth?: unknown; chipHeight?: unknown; cells?: unknown } | null;
}

/** Coerce a stored JSON value to a finite number, or `undefined`. */
export function asFiniteNumber(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function looksLikeFeatureSource(value: Record<string, unknown>): boolean {
  return typeof value.config === 'object' && value.config !== null && !Array.isArray(value.config);
}

function parseRoutingLayer(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value !== 'string') return undefined;
  const match = /^met(\d+)$/i.exec(value.trim());
  if (match) return Number(match[1]);
  return asFiniteNumber(value);
}

/**
 * Extract the fixed numeric feature set from a design/run configuration.
 *
 * Accepts either a flat config record (`{ CLOCK_PERIOD: 8, … }`) or a
 * `{ config, metrics, layout }` wrapper as stored on `openlane_runs`. Every
 * field is optional: missing, null, NaN and non-numeric values contribute 0
 * (aspect ratio defaults to the neutral 1) so partially-populated runs never
 * throw.
 */
export function extractFeatures(source: DesignFeatureSource | Record<string, unknown>): Record<FeatureName, number> {
  const input: DesignFeatureSource = looksLikeFeatureSource(source as Record<string, unknown>)
    ? (source as DesignFeatureSource)
    : { config: source as Record<string, unknown> };
  const config = input.config ?? {};
  const metrics = input.metrics ?? {};
  const layout = input.layout ?? {};

  const dieWidth = asFiniteNumber(config.DIE_AREA_X) ?? asFiniteNumber(layout.chipWidth) ?? 0;
  const dieHeight = asFiniteNumber(config.DIE_AREA_Y) ?? asFiniteNumber(layout.chipHeight) ?? 0;
  const layoutCells = Array.isArray(layout.cells) ? layout.cells.length : undefined;
  const clockPeriod = asFiniteNumber(config.CLOCK_PERIOD)
    ?? asFiniteNumber(metrics['sta_pre__clock_period_ns'])
    ?? 0;
  const strategy = typeof config.SYNTH_STRATEGY === 'string' ? config.SYNTH_STRATEGY.trim() : '';
  const pdk = typeof config.PDK === 'string' ? config.PDK.toLowerCase() : '';

  return {
    clock_period_ns: clockPeriod,
    core_utilization: asFiniteNumber(config.FP_CORE_UTIL) ?? 0,
    place_density: asFiniteNumber(config.PL_TARGET_DENSITY) ?? 0,
    die_width_um: dieWidth,
    die_height_um: dieHeight,
    die_area_um2: dieWidth > 0 && dieHeight > 0 ? dieWidth * dieHeight : 0,
    aspect_ratio: dieWidth > 0 && dieHeight > 0 ? dieWidth / dieHeight : 1,
    cell_count: asFiniteNumber(config.CELL_COUNT) ?? layoutCells ?? 0,
    net_count: asFiniteNumber(config.NET_COUNT) ?? 0,
    routing_max_layer: parseRoutingLayer(config.RT_MAX_LAYER) ?? 0,
    synth_strategy_delay: /^DELAY/i.test(strategy) ? 1 : 0,
    pdk_node_nm: pdk.startsWith('sky130') ? 130 : pdk.startsWith('gf180') ? 180 : 0,
  };
}

// ---------------------------------------------------------------------------
// Training
// ---------------------------------------------------------------------------

export interface RidgeSample {
  /** Named features (missing → 0) or a pre-vectorized row in `featureNames` order. */
  features: FeatureVector | number[];
  label: number;
}

export interface RidgeOptions {
  /** Label persisted with the model, e.g. `area`. */
  target?: string;
  /** Explicit feature order for array samples; inferred (sorted) otherwise. */
  featureNames?: string[];
  /** Gradient-descent step size on standardized features. Default 0.1. */
  learningRate?: number;
  /** L2 penalty applied to slopes only. Default 0.001. */
  l2?: number;
  /** Maximum full-batch passes. Default 3000. */
  epochs?: number;
  /** Stop when |J_prev − J| ≤ tolerance. Default 1e-12. */
  tolerance?: number;
  /** Seed for the deterministic sample shuffle. Default 0. */
  seed?: number;
}

export interface TrainingMetrics {
  /** Coefficient of determination on the training set. */
  r2: number;
  /** Root mean squared error on the training set (label units). */
  rmse: number;
  /** Mean absolute error on the training set (label units). */
  mae: number;
  /** Full-batch passes actually executed. */
  epochs: number;
  /** Final objective value (data loss + L2 penalty). */
  finalLoss: number;
  sampleCount: number;
  featureCount: number;
}

export interface RidgeModel {
  target: string;
  featureNames: string[];
  /** Weights on standardized features. */
  weights: number[];
  /** Intercept — the prediction for an all-means feature vector. */
  intercept: number;
  featureMeans: number[];
  featureStds: number[];
  /** Training residual standard deviation (σ of the uncertainty proxy). */
  residualStd: number;
  sampleCount: number;
  metrics: TrainingMetrics;
  hyperparameters: {
    learningRate: number;
    l2: number;
    epochs: number;
    tolerance: number;
    seed: number;
  };
}

export interface RidgePrediction {
  value: number;
  /** ±1σ proxy from the training residuals. */
  uncertainty: number;
  /** `value ± 1.96 · uncertainty`. */
  lower95: number;
  upper95: number;
  /** True when the model saw fewer than {@link MIN_TRAINING_SAMPLES} samples. */
  insufficientData: boolean;
  /** Feature values actually used (missing inputs read as 0). */
  featureValues: number[];
}

/** Seeded mulberry32 PRNG — the only randomness in the learning path. */
function createSeededRandom(seed: number): () => number {
  let state = (Math.floor(seed) >>> 0) || 0x9e3779b9;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleInPlace<T>(items: T[], random: () => number): void {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
}

function mean(values: number[]): number {
  let total = 0;
  for (const value of values) total += value;
  return values.length ? total / values.length : 0;
}

function dot(left: number[], right: number[]): number {
  let total = 0;
  for (let i = 0; i < left.length; i++) total += left[i] * right[i];
  return total;
}

/** Vectorize a named/array sample against an explicit feature order. */
export function vectorizeFeatures(
  features: FeatureVector | number[],
  featureNames: string[],
  context = 'features',
): number[] {
  if (Array.isArray(features)) {
    if (features.length !== featureNames.length) {
      throw new Error(`${context} has ${features.length} values but the model expects ${featureNames.length}`);
    }
    return features.map(value => (Number.isFinite(value) ? value : 0));
  }
  return featureNames.map(name => {
    const value = features[name];
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
  });
}

function resolveFeatureNames(samples: RidgeSample[], explicit?: string[]): string[] {
  if (explicit && explicit.length > 0) return [...explicit];
  const names = new Set<string>();
  for (const sample of samples) {
    if (Array.isArray(sample.features)) {
      throw new Error('trainRidge requires options.featureNames when samples carry array features');
    }
    for (const name of Object.keys(sample.features)) names.add(name);
  }
  const resolved = [...names].sort();
  if (resolved.length === 0) throw new Error('trainRidge found no numeric features in the training samples');
  return resolved;
}

function validateOptions(learningRate: number, l2: number, epochs: number, tolerance: number, seed: number): void {
  if (!Number.isFinite(learningRate) || learningRate <= 0) throw new Error('learningRate must be a positive number');
  if (!Number.isFinite(l2) || l2 < 0) throw new Error('l2 must be zero or positive');
  if (!Number.isInteger(epochs) || epochs < 1) throw new Error('epochs must be a positive integer');
  if (!Number.isFinite(tolerance) || tolerance < 0) throw new Error('tolerance must be zero or positive');
  if (!Number.isFinite(seed)) throw new Error('seed must be a finite number');
}

/**
 * Fit a ridge regression with full-batch gradient descent.
 *
 * Deterministic: the only pseudo-randomness is a seeded shuffle of the
 * sample order, so equal inputs produce equal weights.
 */
export function trainRidge(samples: RidgeSample[], options: RidgeOptions = {}): RidgeModel {
  if (samples.length === 0) throw new Error('trainRidge requires at least one sample');

  const learningRate = options.learningRate ?? 0.1;
  const l2 = options.l2 ?? 0.001;
  const epochs = options.epochs ?? 3000;
  const tolerance = options.tolerance ?? 1e-12;
  const seed = options.seed ?? 0;
  validateOptions(learningRate, l2, epochs, tolerance, seed);

  const featureNames = resolveFeatureNames(samples, options.featureNames);
  const shuffled = [...samples];
  shuffleInPlace(shuffled, createSeededRandom(seed));

  const rows = shuffled.map((sample, index) =>
    vectorizeFeatures(sample.features, featureNames, `sample ${index} features`));
  const labels = shuffled.map((sample, index) => {
    if (!Number.isFinite(sample.label)) throw new Error(`sample ${index} label is not a finite number`);
    return sample.label;
  });

  const n = rows.length;
  const d = featureNames.length;
  const featureMeans = Array.from({ length: d }, (_, j) => mean(rows.map(row => row[j])));
  const featureStds = Array.from({ length: d }, (_, j) => {
    const variance = mean(rows.map(row => (row[j] - featureMeans[j]) ** 2));
    const std = Math.sqrt(variance);
    return std > 1e-12 ? std : 1;
  });
  const design: number[][] = rows.map(row => row.map((value, j) => (value - featureMeans[j]) / featureStds[j]));

  const weights = new Array<number>(d).fill(0);
  let intercept = mean(labels);
  let previousLoss = Number.POSITIVE_INFINITY;
  let finalLoss = Number.POSITIVE_INFINITY;
  let completedEpochs = 0;

  for (let epoch = 1; epoch <= epochs; epoch++) {
    const gradient = new Array<number>(d).fill(0);
    let biasGradient = 0;
    for (let i = 0; i < n; i++) {
      const residual = intercept + dot(weights, design[i]) - labels[i];
      biasGradient += residual;
      const row = design[i];
      for (let j = 0; j < d; j++) gradient[j] += residual * row[j];
    }
    for (let j = 0; j < d; j++) weights[j] -= learningRate * (gradient[j] / n + l2 * weights[j]);
    intercept -= learningRate * (biasGradient / n);

    let squaredError = 0;
    for (let i = 0; i < n; i++) {
      const residual = intercept + dot(weights, design[i]) - labels[i];
      squaredError += residual * residual;
    }
    const penalty = weights.reduce((total, weight) => total + weight * weight, 0);
    finalLoss = squaredError / (2 * n) + (l2 / 2) * penalty;
    if (!Number.isFinite(finalLoss)) {
      throw new Error('Ridge training diverged; reduce learningRate or epochs');
    }
    completedEpochs = epoch;
    if (Math.abs(previousLoss - finalLoss) <= tolerance) break;
    previousLoss = finalLoss;
  }

  const predictions = design.map(row => intercept + dot(weights, row));
  const meanLabel = mean(labels);
  let squaredResiduals = 0;
  let squaredTotal = 0;
  let absoluteError = 0;
  for (let i = 0; i < n; i++) {
    const residual = predictions[i] - labels[i];
    squaredResiduals += residual * residual;
    squaredTotal += (labels[i] - meanLabel) ** 2;
    absoluteError += Math.abs(residual);
  }
  const r2 = squaredTotal > 1e-12 ? 1 - squaredResiduals / squaredTotal : squaredResiduals < 1e-12 ? 1 : 0;
  const rmse = Math.sqrt(squaredResiduals / n);
  const mae = absoluteError / n;
  const residualStd = Math.sqrt(squaredResiduals / Math.max(1, n - 2));

  return {
    target: options.target ?? 'target',
    featureNames,
    weights,
    intercept,
    featureMeans,
    featureStds,
    residualStd,
    sampleCount: n,
    metrics: { r2, rmse, mae, epochs: completedEpochs, finalLoss, sampleCount: n, featureCount: d },
    hyperparameters: { learningRate, l2, epochs, tolerance, seed },
  };
}

/**
 * Predict a label for one feature vector, with the training-derived
 * uncertainty proxy and an `insufficientData` flag for tiny training sets.
 */
export function predict(model: RidgeModel, features: FeatureVector | number[]): RidgePrediction {
  const values = vectorizeFeatures(features, model.featureNames, 'prediction features');
  const standardized = values.map((value, j) => {
    const std = model.featureStds[j] > 0 ? model.featureStds[j] : 1;
    return (value - model.featureMeans[j]) / std;
  });
  const value = model.intercept + dot(model.weights, standardized);
  const uncertainty = model.residualStd;
  return {
    value,
    uncertainty,
    lower95: value - 1.96 * uncertainty,
    upper95: value + 1.96 * uncertainty,
    insufficientData: model.sampleCount < MIN_TRAINING_SAMPLES,
    featureValues: values,
  };
}
