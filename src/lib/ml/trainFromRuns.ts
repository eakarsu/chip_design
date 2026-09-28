/**
 * Build supervised samples from persisted OpenLane/EDA run rows and train a
 * ridge surrogate via {@link trainRidge}.
 *
 * Source of truth (read-only — this module never writes EDA tables):
 *
 *   openlane_runs.config_json   merged config snapshot (CLOCK_PERIOD,
 *                               FP_CORE_UTIL, PL_TARGET_DENSITY, DIE_AREA_X/Y,
 *                               CELL_COUNT, NET_COUNT, RT_MAX_LAYER, …)
 *   openlane_runs.metrics_json  aggregated metrics.json keys, e.g.
 *                               synthesis__area, synthesis__power,
 *                               sta_post__wns__corner:tt_025C_1v80
 *   openlane_runs.layout_json   chipWidth/chipHeight/cells fallback
 *   openlane_designs.config_json  design-level config fallback
 *
 * A model's label is the first available metric key from a target definition
 * (see {@link ML_TARGETS}); features come from {@link extractFeatures}. When
 * no stored run exposes a target's columns the trainer throws a descriptive
 * error that lists every numeric metric column it did find.
 */

import { randomUUID } from 'crypto';
import type Database from 'better-sqlite3';
import { getRawDb } from '@/lib/db/connection';
import {
  FEATURE_NAMES,
  MIN_TRAINING_SAMPLES,
  asFiniteNumber,
  extractFeatures,
  trainRidge,
  type FeatureVector,
  type RidgeModel,
  type RidgeOptions,
} from './surrogate';
import { countSamples, listSamples, saveModel, saveSamples, type StoredMlModel } from './store';

export interface MlTargetDefinition {
  target: string;
  label: string;
  description: string;
  /** Metric keys checked in order; the first finite value wins. */
  metricKeys: string[];
}

/** Targets the stored OpenLane metric set can supervise. */
export const ML_TARGETS: MlTargetDefinition[] = [
  {
    target: 'area',
    label: 'Cell area (um^2)',
    description: 'Synthesized cell area reported by the synthesis stage.',
    metricKeys: ['synthesis__area', 'floorplan__die_area'],
  },
  {
    target: 'power',
    label: 'Estimated power (mW)',
    description: 'Estimated power from the synthesis stage.',
    metricKeys: ['synthesis__power'],
  },
  {
    target: 'slack',
    label: 'Worst negative slack (ns)',
    description: 'Worst setup slack across STA corners (post-layout preferred).',
    metricKeys: ['sta_post__wns__corner:tt_025C_1v80', 'sta_pre__wns__corner:tt_025C_1v80'],
  },
  {
    target: 'critical_path',
    label: 'Critical path (ns)',
    description: 'Critical path delay estimated during synthesis.',
    metricKeys: ['synthesis__critical_path_ns'],
  },
  {
    target: 'wirelength',
    label: 'Routed wirelength',
    description: 'Total routed wirelength, falling back to detailed placement.',
    metricKeys: ['routing__wirelength', 'placement__wirelength_detailed'],
  },
  {
    target: 'drc_violations',
    label: 'DRC violations',
    description: 'Design-rule violations reported by the DRC stage.',
    metricKeys: ['drc__num_violations'],
  },
  {
    target: 'runtime_ms',
    label: 'Flow runtime (ms)',
    description: 'Total flow runtime as recorded in metrics.json.',
    metricKeys: ['flow__total_runtime_ms'],
  },
];

export interface OpenlaneRunSampleSource {
  id: string;
  designId: string;
  tag: string;
  status: string;
  config: Record<string, unknown>;
  metrics: Record<string, unknown>;
  layout: Record<string, unknown>;
}

export interface TrainingSample {
  features: Record<string, number>;
  label: number;
  runId: string;
  tag: string;
  metricKey: string;
}

export interface CollectedSamples {
  samples: TrainingSample[];
  runsConsidered: number;
  runsSkipped: number;
  availableMetricColumns: string[];
  /** Where the samples came from, newest source first. */
  sources: Array<'openlane_runs' | 'stored_samples'>;
  /** Targets with stored ml_samples but no OpenLane runs. */
  storedSampleCount: number;
}

export interface TargetAvailability extends MlTargetDefinition {
  sampleCount: number;
  available: boolean;
  /** Samples contributed by stored OpenLane runs (0 when only ml_samples exist). */
  runSampleCount?: number;
  /** Samples contributed by persisted ml_samples rows. */
  storedSampleCount?: number;
}

export interface TrainFromRunsOptions extends Omit<RidgeOptions, 'target' | 'featureNames'> {
  /** Persisted model name; defaults to `<target>-ridge-<ISO timestamp>`. */
  name?: string;
}

export interface TrainFromRunsInput {
  target: string;
  options?: TrainFromRunsOptions;
  createdBy?: string;
}

export interface TrainFromRunsResult {
  model: StoredMlModel;
  sampleCount: number;
  runsConsidered: number;
  runsSkipped: number;
  insufficientData: boolean;
  availableTargets: TargetAvailability[];
}

interface OpenlaneRunRow {
  id: string;
  design_id: string;
  tag: string;
  status: string;
  config_json: string;
  metrics_json: string;
  layout_json: string;
  design_config_json: string | null;
}

function safeObject(source: string | null): Record<string, unknown> {
  if (!source) return {};
  try {
    const parsed = JSON.parse(source) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function findTarget(target: string): MlTargetDefinition {
  const definition = ML_TARGETS.find(candidate => candidate.target === target);
  if (!definition) {
    throw new Error(
      `Unknown ML target "${target}". Available targets: ${ML_TARGETS.map(candidate => candidate.target).join(', ')}`,
    );
  }
  return definition;
}

function pickLabel(
  metrics: Record<string, unknown>,
  metricKeys: string[],
): { key: string; value: number } | undefined {
  for (const key of metricKeys) {
    const value = asFiniteNumber(metrics[key]);
    if (value !== undefined) return { key, value };
  }
  return undefined;
}

function numericMetricColumns(sources: OpenlaneRunSampleSource[]): string[] {
  const columns = new Set<string>();
  for (const source of sources) {
    for (const [key, value] of Object.entries(source.metrics)) {
      if (asFiniteNumber(value) !== undefined) columns.add(key);
    }
  }
  return [...columns].sort();
}

/**
 * Read every finished (non-running) OpenLane run as a features/label source.
 * Returns `[]` when the table does not exist yet (fresh database).
 */
export function listOpenlaneRunSources(db: Database.Database = getRawDb()): OpenlaneRunSampleSource[] {
  const table = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='openlane_runs'",
  ).get() as { name: string } | undefined;
  if (!table) return [];
  const rows = db.prepare(`
    SELECT r.id, r.design_id, r.tag, r.status, r.config_json, r.metrics_json, r.layout_json,
           d.config_json AS design_config_json
    FROM openlane_runs r
    LEFT JOIN openlane_designs d ON d.id = r.design_id
    WHERE r.status <> 'running'
    ORDER BY r.started_at, r.id
  `).all() as OpenlaneRunRow[];
  return rows.map(row => ({
    id: row.id,
    designId: row.design_id,
    tag: row.tag,
    status: row.status,
    // Run snapshot wins over the design default; either may be missing.
    config: { ...safeObject(row.design_config_json), ...safeObject(row.config_json) },
    metrics: safeObject(row.metrics_json),
    layout: safeObject(row.layout_json),
  }));
}

/** Sample counts per target across stored runs and persisted ml_samples. */
export function availableTargets(db: Database.Database = getRawDb()): TargetAvailability[] {
  const sources = listOpenlaneRunSources(db);
  const stored = countSamples().byTarget;
  return ML_TARGETS.map(definition => {
    let runCount = 0;
    for (const source of sources) {
      if (pickLabel(source.metrics, definition.metricKeys)) runCount++;
    }
    const storedCount = stored[definition.target] ?? 0;
    const sampleCount = runCount || storedCount;
    return {
      ...definition,
      sampleCount,
      available: sampleCount > 0,
      runSampleCount: runCount,
      storedSampleCount: storedCount,
    } as TargetAvailability;
  });
}

/**
 * Build (features, label) samples for one target.
 *
 * Primary source: finished OpenLane runs (real flow metric keys). When no run
 * exposes the target's metric keys, fall back to rows already persisted in
 * `ml_samples` for that target — these are pre-computed feature/label pairs
 * (for example the demo loader's clearly-labelled synthetic samples, or samples
 * saved by an earlier run). Every sample keeps its source for provenance.
 */
export function collectTrainingSamples(
  target: string,
  db: Database.Database = getRawDb(),
): CollectedSamples {
  const definition = findTarget(target);
  const sources = listOpenlaneRunSources(db);
  const samples: TrainingSample[] = [];
  let runsSkipped = 0;
  for (const source of sources) {
    const match = pickLabel(source.metrics, definition.metricKeys);
    if (!match) {
      runsSkipped++;
      continue;
    }
    samples.push({
      features: extractFeatures({ config: source.config, metrics: source.metrics, layout: source.layout }),
      label: match.value,
      runId: source.id,
      tag: source.tag,
      metricKey: match.key,
    });
  }

  const collectedSources: CollectedSamples['sources'] = samples.length ? ['openlane_runs'] : [];
  let storedSampleCount = 0;
  if (samples.length === 0) {
    const stored = listSamples({ target: definition.target });
    for (const sample of stored) {
      samples.push({
        features: sample.features,
        label: sample.label,
        runId: sample.sourceId ?? sample.id,
        tag: sample.source,
        metricKey: `ml_samples:${sample.source}`,
      });
    }
    storedSampleCount = stored.length;
    if (stored.length) collectedSources.push('stored_samples');
  }

  return {
    samples,
    runsConsidered: sources.length,
    runsSkipped,
    availableMetricColumns: numericMetricColumns(sources),
    sources: collectedSources,
    storedSampleCount,
  };
}

/**
 * Train and persist a ridge surrogate for `target` from the stored run rows.
 *
 * Throws a descriptive error when the target is unknown, or when no stored
 * run exposes the target's metric keys (the message lists every numeric
 * metric column that was found).
 */
export function trainFromRuns(input: TrainFromRunsInput): TrainFromRunsResult {
  const definition = findTarget(input.target);
  const collected = collectTrainingSamples(definition.target);

  if (collected.samples.length === 0) {
    const columns = collected.availableMetricColumns.length
      ? collected.availableMetricColumns.join(', ')
      : '(no numeric metric columns found)';
    throw new Error(
      `No usable samples for ML target "${definition.target}": none of the ${collected.runsConsidered} stored `
      + `openlane_runs rows expose [${definition.metricKeys.join(', ')}] and no ml_samples rows are stored for this target. `
      + `Available metric columns: ${columns}. Run an OpenLane flow, load demo data, or POST samples before training.`,
    );
  }

  const ridge: RidgeModel = trainRidge(
    collected.samples.map(sample => ({ features: sample.features, label: sample.label })),
    { ...input.options, target: definition.target, featureNames: [...FEATURE_NAMES] },
  );

  const createdAt = new Date().toISOString();
  const model: StoredMlModel = {
    ...ridge,
    id: randomUUID(),
    name: input.options?.name ?? `${definition.target}-ridge-${createdAt}`,
    createdAt,
    createdBy: input.createdBy,
    source: collected.sources.join('+') || 'openlane_runs',
  };

  saveModel(model);
  const persisted = saveSamples(
    collected.samples.map(sample => ({
      target: definition.target,
      features: sample.features as FeatureVector,
      label: sample.label,
      modelId: model.id,
      source: collected.sources.includes('stored_samples') ? 'stored_samples' : 'openlane_runs',
      sourceId: sample.runId,
    })),
    createdAt,
  );

  return {
    model,
    sampleCount: persisted,
    runsConsidered: collected.runsConsidered,
    runsSkipped: collected.runsSkipped,
    insufficientData: model.sampleCount < MIN_TRAINING_SAMPLES,
    availableTargets: availableTargets(),
  };
}
