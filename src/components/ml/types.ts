/**
 * Response types for the ML predictor workspace API.
 *
 * These mirror the JSON returned by `app/api/ml/*` and the model types in
 * `src/lib/ml/*`. Nothing here is computed on the client.
 */

export interface MlTargetStatus {
  target: string;
  label: string;
  description: string;
  metricKeys: string[];
  sampleCount: number;
  available: boolean;
}

export interface MlModelSummary {
  id: string;
  name: string;
  target: string;
  source: string;
  sampleCount: number;
  r2: number;
  rmse: number;
  residualStd: number;
  insufficientData: boolean;
  createdBy?: string;
  createdAt: string;
}

export interface MlSamples {
  total: number;
  byTarget: Record<string, number>;
}

export interface MlStatusResponse {
  generatedAt: string;
  minTrainingSamples: number;
  targets: MlTargetStatus[];
  samples: MlSamples;
  models: MlModelSummary[];
}

/* ------------------------------------------------------------------ train */

export interface TrainingMetrics {
  r2: number;
  rmse: number;
  mae: number;
  epochs: number;
  finalLoss: number;
  sampleCount: number;
  featureCount: number;
}

export interface RidgeHyperparameters {
  learningRate: number;
  l2: number;
  epochs: number;
  tolerance: number;
  seed: number;
}

export interface TrainResponse {
  model: {
    id: string;
    name: string;
    target: string;
    featureNames: string[];
    weights: number[];
    intercept: number;
    featureMeans: number[];
    featureStds: number[];
    residualStd: number;
    sampleCount: number;
    source: string;
    createdAt: string;
  };
  metrics: TrainingMetrics;
  hyperparameters: RidgeHyperparameters;
  insufficientData: boolean;
  minTrainingSamples: number;
  sampleCount: number;
  runsConsidered: number;
  runsSkipped: number;
  availableTargets: Array<{ target: string; sampleCount: number; available: boolean }>;
}

/* ---------------------------------------------------------------- predict */

export interface RidgePrediction {
  value: number;
  /** ±1σ proxy from the training residuals. */
  uncertainty: number;
  lower95: number;
  upper95: number;
  insufficientData: boolean;
  featureValues: number[];
}

export interface PredictResponse {
  model: {
    id: string;
    name: string;
    target: string;
    sampleCount: number;
    trainedAt: string;
  };
  prediction: RidgePrediction;
  features: Record<string, number>;
}

/**
 * Display labels for the fixed feature order returned by the predictor.
 * These are input descriptions, not results.
 */
export const FEATURE_LABELS: Record<string, string> = {
  clock_period_ns: 'Clock period (ns)',
  core_utilization: 'Core utilization (FP_CORE_UTIL)',
  place_density: 'Placement density (PL_TARGET_DENSITY)',
  die_width_um: 'Die width (µm)',
  die_height_um: 'Die height (µm)',
  die_area_um2: 'Die area (µm²)',
  aspect_ratio: 'Aspect ratio',
  cell_count: 'Cell count',
  net_count: 'Net count',
  routing_max_layer: 'Routing max layer (RT_MAX_LAYER)',
  synth_strategy_delay: 'Delay-oriented synthesis strategy (0/1)',
  pdk_node_nm: 'PDK node (nm)',
};
