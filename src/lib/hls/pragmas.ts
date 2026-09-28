/**
 * Pragma design-space enumeration for the HLS workspace.
 *
 * HONESTY CONTRACT
 * ----------------
 * These pragmas are THIS WORKSPACE'S OWN annotation vocabulary. No commercial
 * or open-source HLS tool consumes them. Enumerating a design space is not a
 * search run, not a compile, and not synthesis evidence; the ranking below is
 * computed by the analytical estimator in ./estimator.ts and carries its
 * label.
 *
 * The space is bounded and deterministic: the same kernel and the same options
 * always produce the same points in the same order.
 */

import type { KernelIR } from './kernel';
import {
  estimateDesignPoint,
  normalizeWeights,
  type Estimate,
  type EstimateWeights,
} from './estimator';

export const PRAGMA_SPACE_LABEL = 'analytical design-space enumeration (no tool-in-the-loop search)' as const;

/** Per-loop knobs. Parallel and unroll factors are independent multipliers on concurrent iterations. */
export interface PragmaOptionInput {
  parallelFactors: number[];
  pipelineIIs: number[];
  unrollFactors: number[];
  /** Tiling is only offered for loops that contain nested loops. */
  tileFactors: number[];
  /** Hard cap on returned points; clamped to [1, 5000]. */
  maxPoints: number;
}

export interface ResolvedPragmaOptions {
  parallelFactors: number[];
  pipelineIIs: number[];
  unrollFactors: number[];
  tileFactors: number[];
  maxPoints: number;
}

export const DEFAULT_PRAGMA_OPTIONS: ResolvedPragmaOptions = {
  parallelFactors: [1, 2, 4],
  pipelineIIs: [1, 2, 4],
  unrollFactors: [1, 2, 4],
  tileFactors: [1, 2, 4],
  maxPoints: 5000,
};

export const MAX_DESIGN_SPACE_POINTS = 5000;
const FACTOR_LIMIT = 64;

export interface LoopPragma {
  loopId: string;
  /** True when the loop contains nested loops and tiling is applicable. */
  tileable: boolean;
  parallelFactor: number;
  pipelineII: number;
  unrollFactor: number;
  tileFactor: number;
}

export interface DesignPoint {
  id: string;
  index: number;
  /** Stable canonical key over all loop pragmas; array order is parse order. */
  pragmaKey: string;
  loopPragmas: LoopPragma[];
  /** Human-readable workspace pragma lines, one per non-default directive. */
  directives: string[];
}

export interface DesignSpace {
  label: typeof PRAGMA_SPACE_LABEL;
  kernel: { name: string; loops: number; ops: number };
  options: ResolvedPragmaOptions;
  /** Exact product when representable; capped at 1e15 and reported with `totalCombinationsCapped`. */
  totalCombinations: number;
  totalCombinationsCapped: boolean;
  sampled: boolean;
  samplingStride: number;
  returned: number;
  points: DesignPoint[];
  notes: string[];
}

export interface DesignPointInput {
  loopId: string;
  parallelFactor?: number;
  pipelineII?: number;
  unrollFactor?: number;
  tileFactor?: number;
}

export interface RankedDesignPoint extends DesignPoint {
  estimate: Estimate;
  /** Weighted score over population-normalized metrics (lower is better). */
  weightedScore: number;
  pareto: boolean;
  rank: number;
  dominates: number;
  dominatedBy: number;
}

/* ------------------------------------------------------- option validation */

function sanitizeFactors(input: number[] | undefined, fallback: number[], what: string): number[] {
  if (input === undefined) return [...fallback];
  const seen = new Set<number>();
  const values: number[] = [];
  for (const value of input) {
    if (!Number.isInteger(value) || value < 1 || value > FACTOR_LIMIT) {
      throw new Error(`${what} must contain integers between 1 and ${FACTOR_LIMIT}`);
    }
    if (!seen.has(value)) { seen.add(value); values.push(value); }
  }
  if (values.length === 0) throw new Error(`${what} must not be empty`);
  return values.sort((a, b) => a - b);
}

export function resolvePragmaOptions(input?: Partial<PragmaOptionInput>): ResolvedPragmaOptions {
  const maxPoints = input?.maxPoints === undefined ? DEFAULT_PRAGMA_OPTIONS.maxPoints : Math.floor(input.maxPoints);
  if (!Number.isInteger(maxPoints) || maxPoints < 1) throw new Error('maxPoints must be a positive integer');
  return {
    parallelFactors: sanitizeFactors(input?.parallelFactors, DEFAULT_PRAGMA_OPTIONS.parallelFactors, 'parallelFactors'),
    pipelineIIs: sanitizeFactors(input?.pipelineIIs, DEFAULT_PRAGMA_OPTIONS.pipelineIIs, 'pipelineIIs'),
    unrollFactors: sanitizeFactors(input?.unrollFactors, DEFAULT_PRAGMA_OPTIONS.unrollFactors, 'unrollFactors'),
    tileFactors: sanitizeFactors(input?.tileFactors, DEFAULT_PRAGMA_OPTIONS.tileFactors, 'tileFactors'),
    maxPoints: Math.min(maxPoints, MAX_DESIGN_SPACE_POINTS),
  };
}

/* -------------------------------------------------------------- enumeration */

function loopOptions(loopTiling: boolean, options: ResolvedPragmaOptions): number[][] {
  const tileValues = loopTiling ? options.tileFactors : [1];
  const combinations: number[][] = [];
  for (const parallel of options.parallelFactors) {
    for (const ii of options.pipelineIIs) {
      for (const unroll of options.unrollFactors) {
        for (const tile of tileValues) {
          combinations.push([parallel, ii, unroll, tile]);
        }
      }
    }
  }
  return combinations;
}

function loopTilingApplicable(kernel: KernelIR, loopId: string): boolean {
  return kernel.loops.some((loop) => loop.parentId === loopId);
}

function decode(index: number, radices: number[]): number[] {
  const digits = new Array<number>(radices.length).fill(0);
  let remainder = index;
  for (let position = radices.length - 1; position >= 0; position -= 1) {
    digits[position] = remainder % radices[position];
    remainder = Math.floor(remainder / radices[position]);
  }
  return digits;
}

function pragmaKey(loopPragmas: LoopPragma[]): string {
  return loopPragmas
    .map((pragma) => `${pragma.loopId}:p${pragma.parallelFactor},i${pragma.pipelineII},u${pragma.unrollFactor},t${pragma.tileFactor}`)
    .join('|');
}

function directiveLines(loopPragmas: LoopPragma[]): string[] {
  const lines: string[] = [];
  for (const pragma of loopPragmas) {
    lines.push(`#pragma HLS PARALLEL loop=${pragma.loopId} factor=${pragma.parallelFactor}`);
    lines.push(`#pragma HLS PIPELINE loop=${pragma.loopId} ii=${pragma.pipelineII}`);
    lines.push(`#pragma HLS UNROLL loop=${pragma.loopId} factor=${pragma.unrollFactor}`);
    if (pragma.tileable || pragma.tileFactor > 1) {
      lines.push(`#pragma HLS TILE loop=${pragma.loopId} factor=${pragma.tileFactor}`);
    }
  }
  return lines;
}

/**
 * Enumerate a bounded, deterministic slice of the pragma design space.
 * The deepest loop varies fastest, so consecutive points differ in the inner
 * loop and the slice still covers all knob combinations.
 */
export function enumerateDesignSpace(kernel: KernelIR, input?: Partial<PragmaOptionInput>): DesignSpace {
  const options = resolvePragmaOptions(input);
  if (kernel.loops.length === 0) {
    const point: DesignPoint = {
      id: 'dp-0000',
      index: 0,
      pragmaKey: 'straight-line',
      loopPragmas: [],
      directives: ['# pragma space is empty: the kernel has no loops'],
    };
    return {
      label: PRAGMA_SPACE_LABEL,
      kernel: { name: kernel.name, loops: 0, ops: kernel.ops.length },
      options,
      totalCombinations: 1,
      totalCombinationsCapped: false,
      sampled: false,
      samplingStride: 1,
      returned: 1,
      points: [point],
      notes: [
        'the kernel has no loops; a single straight-line design point is returned',
        'pragma vocabulary is defined by this workspace and is not consumed by any commercial HLS tool',
      ],
    };
  }

  const perLoop = kernel.loops.map((loop) => loopOptions(loopTilingApplicable(kernel, loop.id), options));
  const radices = perLoop.map((combinations) => combinations.length);

  let total = 1;
  let capped = false;
  for (const radix of radices) {
    total *= radix;
    if (total > 1e15) { total = 1e15; capped = true; break; }
  }

  const sampled = total > options.maxPoints;
  const stride = sampled ? Math.ceil(total / options.maxPoints) : 1;
  const indices: number[] = [];
  if (sampled) {
    for (let index = 0; index < total && indices.length < options.maxPoints; index += stride) indices.push(index);
  } else {
    for (let index = 0; index < total; index += 1) indices.push(index);
  }

  const points = indices.map((combinationIndex) => {
    const digits = decode(combinationIndex, radices);
    const loopPragmas: LoopPragma[] = kernel.loops.map((loop, loopIndex) => {
      const [parallelFactor, pipelineII, unrollFactor, tileFactor] = perLoop[loopIndex][digits[loopIndex]];
      return {
        loopId: loop.id,
        tileable: loopTilingApplicable(kernel, loop.id),
        parallelFactor,
        pipelineII,
        unrollFactor,
        tileFactor,
      };
    });
    return {
      id: `dp-${String(combinationIndex).padStart(4, '0')}`,
      index: combinationIndex,
      pragmaKey: pragmaKey(loopPragmas),
      loopPragmas,
      directives: directiveLines(loopPragmas),
    } satisfies DesignPoint;
  });

  const notes = [
    'pragma vocabulary is defined by this workspace and is not consumed by any commercial HLS tool',
    'parallel and unroll factors are independent multipliers on concurrent iterations; pragma legality is never checked here',
    sampled
      ? `the full space has ${capped ? 'at least ' : ''}${total} combinations; a deterministic stride-${stride} sample of ${points.length} points was returned`
      : `the full space has ${total} combinations and all of them are returned`,
    'tiling is only offered on loops that contain nested loops; a tile factor of 1 means no tiling',
    'every point is ranked by the analytical estimator; the ranking is not synthesis evidence',
  ];

  return {
    label: PRAGMA_SPACE_LABEL,
    kernel: { name: kernel.name, loops: kernel.loops.length, ops: kernel.ops.length },
    options,
    totalCombinations: total,
    totalCombinationsCapped: capped,
    sampled,
    samplingStride: stride,
    returned: points.length,
    points,
    notes,
  };
}

/* ----------------------------------------------------------- normalization */

function clampFactor(value: number, what: string): number {
  if (value === undefined) return 1;
  if (!Number.isInteger(value) || value < 1 || value > FACTOR_LIMIT) {
    throw new Error(`${what} must be an integer between 1 and ${FACTOR_LIMIT}`);
  }
  return value;
}

/**
 * Fill partial pragma lists into a complete design point for the kernel.
 * Unknown loop ids are rejected; missing loops get the identity pragma values.
 */
export function normalizeDesignPoint(kernel: KernelIR, input?: DesignPointInput[], id = 'custom'): DesignPoint {
  const known = new Set(kernel.loops.map((loop) => loop.id));
  const supplied = new Map<string, DesignPointInput>();
  for (const entry of input ?? []) {
    if (!entry || typeof entry.loopId !== 'string') throw new Error('each loop pragma needs a loopId');
    if (!known.has(entry.loopId)) {
      throw new Error(`unknown loopId "${entry.loopId}"; this kernel has ${kernel.loops.map((loop) => loop.id).join(', ') || 'no loops'}`);
    }
    supplied.set(entry.loopId, entry);
  }

  const loopPragmas: LoopPragma[] = kernel.loops.map((loop) => {
    const entry = supplied.get(loop.id);
    return {
      loopId: loop.id,
      tileable: loopTilingApplicable(kernel, loop.id),
      parallelFactor: clampFactor(entry?.parallelFactor ?? 1, `${loop.id}.parallelFactor`),
      pipelineII: clampFactor(entry?.pipelineII ?? 1, `${loop.id}.pipelineII`),
      unrollFactor: clampFactor(entry?.unrollFactor ?? 1, `${loop.id}.unrollFactor`),
      tileFactor: clampFactor(entry?.tileFactor ?? 1, `${loop.id}.tileFactor`),
    };
  });

  return {
    id,
    index: -1,
    pragmaKey: pragmaKey(loopPragmas),
    loopPragmas,
    directives: directiveLines(loopPragmas),
  };
}

/* ----------------------------------------------------------------- ranking */

interface ParetoMetrics {
  latencyCycles: number;
  area: number;
  memoryTrafficBytes: number;
}

function dominates(a: ParetoMetrics, b: ParetoMetrics): boolean {
  const atMost = a.latencyCycles <= b.latencyCycles && a.area <= b.area && a.memoryTrafficBytes <= b.memoryTrafficBytes;
  const strictly = a.latencyCycles < b.latencyCycles || a.area < b.area || a.memoryTrafficBytes < b.memoryTrafficBytes;
  return atMost && strictly;
}

/**
 * Rank design points by Pareto dominance (latency, area, memory) plus an
 * optional weighted score over population-normalized metrics.
 */
export function rankDesignPoints(
  kernel: KernelIR,
  points: DesignPoint[],
  weightsInput?: Partial<EstimateWeights>,
): RankedDesignPoint[] {
  const weights = normalizeWeights(weightsInput);
  const estimates = points.map((point) => estimateDesignPoint(kernel, point));
  const metrics: ParetoMetrics[] = estimates.map((estimate) => ({
    latencyCycles: estimate.latencyCycles,
    area: estimate.scores.area,
    memoryTrafficBytes: estimate.memoryTrafficBytes,
  }));

  const maxLatency = Math.max(1, ...metrics.map((metric) => metric.latencyCycles));
  const maxArea = Math.max(Number.EPSILON, ...metrics.map((metric) => metric.area));
  const maxMemory = Math.max(1, ...metrics.map((metric) => metric.memoryTrafficBytes));
  const weightTotal = weights.latency + weights.area + weights.memory + weights.power;

  const ranked = points.map((point, index) => {
    let pareto = true;
    let dominatesCount = 0;
    let dominatedByCount = 0;
    for (let other = 0; other < metrics.length; other += 1) {
      if (other === index) continue;
      if (dominates(metrics[other], metrics[index])) dominatedByCount += 1;
      if (dominates(metrics[index], metrics[other])) dominatesCount += 1;
    }
    if (dominatedByCount > 0) pareto = false;

    const estimate = estimates[index];
    const weightedScore = (
      weights.latency * (estimate.latencyCycles / maxLatency) +
      weights.area * (estimate.scores.area / maxArea) +
      weights.memory * (estimate.memoryTrafficBytes / maxMemory) +
      weights.power * (estimate.scores.power / maxArea)
    ) / weightTotal;

    return { ...point, estimate, weightedScore, pareto, rank: 0, dominates: dominatesCount, dominatedBy: dominatedByCount };
  });

  ranked.sort((a, b) => a.weightedScore - b.weightedScore || a.pragmaKey.localeCompare(b.pragmaKey));
  ranked.forEach((entry, index) => { entry.rank = index + 1; });
  return ranked;
}

/** Convenience: enumerate and rank in one call. */
export function exploreDesignSpace(
  kernel: KernelIR,
  options?: Partial<PragmaOptionInput>,
  weights?: Partial<EstimateWeights>,
): { space: DesignSpace; ranked: RankedDesignPoint[] } {
  const space = enumerateDesignSpace(kernel, options);
  return { space, ranked: rankDesignPoints(kernel, space.points, weights) };
}
