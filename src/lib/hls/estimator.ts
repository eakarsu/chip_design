/**
 * Analytical HLS cost model for the restricted kernel IR.
 *
 * HONESTY CONTRACT
 * ----------------
 * Every number produced by this module is an ANALYTICAL ESTIMATE computed from
 * the parsed kernel and the selected pragma set. No synthesis, scheduling,
 * placement, simulation, or timing analysis is performed, and none of these
 * numbers may be presented as synthesis evidence. All outputs carry
 * {@link ESTIMATOR_LABEL}.
 *
 * The model is deliberately monotone where the design intent is monotone:
 * increasing parallel/unroll factors decreases the cycle estimate and
 * increases the resource estimate; increasing tiling reduces the modelled
 * memory traffic. See {@link ESTIMATOR_ASSUMPTIONS} for every assumption.
 */

import type { KernelIR, LoopInfo, PrimitiveOp } from './kernel';
import type { DesignPoint, LoopPragma } from './pragmas';

export const ESTIMATOR_LABEL = 'analytical estimate, not synthesis evidence' as const;
export const ESTIMATOR_VERSION = 1;

/** Documented model constants. Units are stated where they exist. */
export const ESTIMATOR_CONSTANTS = {
  /** Bytes per kernel element (the subset is 32-bit integer only). */
  bytesPerElement: 4,
  /** Register bits per element / scalar. */
  elementBits: 32,
  /** DSP blocks consumed by one `*`. */
  dspPerMultiply: 1,
  /** LUTs for one `+` or `-` operator. */
  lutPerAddSub: 48,
  /** LUTs for one `/` operator (modelled as a multi-cycle divider). */
  lutPerDivide: 1024,
  /** LUTs for one `%` operator. */
  lutPerModulo: 512,
  /** LUTs for loop control, counter compare and state decoding per loop. */
  lutPerLoopControl: 24,
  /** Flip-flops per pipeline stage of a replicated operator. */
  ffPerPipelineStage: 32,
  /** Pipeline fill + drain cycles charged once per loop. */
  pipelineDepthCycles: 2,
  /** Bytes of 32-bit storage per inferred block RAM (one 36 Kb block, conservatively 4 KiB usable). */
  bramBytes: 4096,
  /** Factor by which a tiled enclosing loop is assumed to divide memory traffic (perfect tile reuse). */
  tilingReuseModel: 'traffic divided by the product of tile factors of enclosing tiled loops',
  /** Resources are capped per op so the estimate stays finite. */
  maxReplicationPerOp: 4096,
} as const;

export const ESTIMATOR_ASSUMPTIONS: readonly string[] = [
  'the kernel is in the constant-bound affine subset parsed by kernel.ts; trip counts are those resolved constants',
  'latency is measured in cycles at an unspecified clock; frequency, voltage, and technology are not modelled',
  'per loop: iterations = ceil(tripCount / (parallelFactor * unrollFactor)), lanes are capped at the trip count',
  'per loop step: ownOpCount operations issue one per cycle at the given initiation interval (II); II is a request, not a proven schedule',
  'each loop adds a fixed 2-cycle pipeline fill/drain; nested loops add their own cycle estimate per enclosing step',
  'if/else arms are all counted once; data-dependent branch outcomes are not resolved, so this is a worst-case op mix',
  'no dependence analysis is performed: loop-carried scalars and array dependences are never checked against the requested pragmas',
  'resources are estimated by replicating each op by the product of lanes of the loops enclosing it (capped at 4096 copies/op)',
  'multipliers map to 1 DSP each, add/sub to 48 LUTs, divide to 1024 LUTs, modulo to 512 LUTs, plus 24 LUTs of loop control per loop',
  'flip-flops = 32 per scalar plus 32 per pipeline stage of each replicated operator',
  'array storage is mapped to 4 KiB block-RAM blocks; no banking, port arbitration, or memory-inference analysis is done',
  'memory traffic = one 4-byte access per executing iteration; tiling divides traffic by the product of tile factors of tiled enclosing loops assuming perfect tile-local reuse (optimistic)',
  'power is a unitless relative score derived from area and modelled activity; it is not watts',
  'pragma legality (dependences, memory conflicts, resource sharing) is entirely the caller\'s responsibility',
];

export interface EstimateCostPoint {
  loopId: string;
  parentId: string | null;
  depth: number;
  tripCount: number;
  parallelFactor: number;
  unrollFactor: number;
  pipelineII: number;
  tileFactor: number;
  lanes: number;
  iterations: number;
  ownOpCount: number;
  innerCycles: number;
  loopCycles: number;
}

export interface EstimateResources {
  dsp: number;
  lut: number;
  ff: number;
  bram: number;
  /** Total replicated ops across the design. */
  replicatedOps: number;
}

/** Unitless scores; latency is additionally available in cycles, memory in bytes. */
export interface EstimateScores {
  latency: number;
  area: number;
  memory: number;
  power: number;
}

export interface Estimate {
  estimatorVersion: typeof ESTIMATOR_VERSION;
  label: typeof ESTIMATOR_LABEL;
  designPoint: { id: string; pragmaKey: string };
  latencyCycles: number;
  /** Fraction of cycles in which the datapath is modelled as active (0..1]. */
  activity: number;
  resources: EstimateResources;
  memoryTrafficBytes: number;
  memoryTrafficElements: number;
  scores: EstimateScores;
  opMix: KernelIR['opMix'];
  loopBreakdown: EstimateCostPoint[];
  straightLineOps: number;
  assumptions: string[];
  caveats: string[];
}

export interface EstimateWeights {
  latency: number;
  area: number;
  memory: number;
  power: number;
}

export const DEFAULT_ESTIMATE_WEIGHTS: EstimateWeights = { latency: 0.4, area: 0.3, memory: 0.3, power: 0 };

export function normalizeWeights(input?: Partial<EstimateWeights>): EstimateWeights {
  const merged: EstimateWeights = { ...DEFAULT_ESTIMATE_WEIGHTS, ...(input ?? {}) };
  for (const key of Object.keys(merged) as Array<keyof EstimateWeights>) {
    const value = merged[key];
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`objective weight "${key}" must be a finite number >= 0`);
    }
  }
  const total = merged.latency + merged.area + merged.memory + merged.power;
  if (total <= 0) throw new Error('at least one objective weight must be greater than zero');
  return merged;
}

function laneCount(loop: LoopInfo, pragma: LoopPragma): number {
  const requested = Math.max(1, pragma.parallelFactor) * Math.max(1, pragma.unrollFactor);
  return Math.max(1, Math.min(requested, Math.max(1, loop.tripCount)));
}

function loopCyclesFor(
  loop: LoopInfo,
  pragma: LoopPragma,
  childCycles: number,
): EstimateCostPoint {
  const lanes = laneCount(loop, pragma);
  const iterations = loop.tripCount > 0 ? Math.ceil(loop.tripCount / lanes) : 0;
  const issueCycles = loop.ownOpCount * Math.max(1, pragma.pipelineII);
  const innerCycles = childCycles;
  const loopCycles = iterations * (issueCycles + innerCycles) + (iterations > 0 ? ESTIMATOR_CONSTANTS.pipelineDepthCycles : 0);
  return {
    loopId: loop.id,
    parentId: loop.parentId,
    depth: loop.depth,
    tripCount: loop.tripCount,
    parallelFactor: pragma.parallelFactor,
    unrollFactor: pragma.unrollFactor,
    pipelineII: Math.max(1, pragma.pipelineII),
    tileFactor: Math.max(1, pragma.tileFactor),
    lanes,
    iterations,
    ownOpCount: loop.ownOpCount,
    innerCycles,
    loopCycles,
  };
}

function pragmaFor(point: DesignPoint, loopId: string): LoopPragma {
  return point.loopPragmas.find((pragma) => pragma.loopId === loopId) ?? {
    loopId,
    tileable: false,
    parallelFactor: 1,
    pipelineII: 1,
    unrollFactor: 1,
    tileFactor: 1,
  };
}

function replicationFor(op: PrimitiveOp, kernel: KernelIR, point: DesignPoint): number {
  let replication = 1;
  const loopsById = new Map(kernel.loops.map((loop) => [loop.id, loop]));
  for (const loopId of op.loopPath) {
    const loop = loopsById.get(loopId);
    if (!loop) continue;
    replication *= laneCount(loop, pragmaFor(point, loopId));
    if (replication >= ESTIMATOR_CONSTANTS.maxReplicationPerOp) {
      return ESTIMATOR_CONSTANTS.maxReplicationPerOp;
    }
  }
  return replication;
}

/** Estimate one design point. This is an analytical estimate, not synthesis evidence. */
export function estimateDesignPoint(kernel: KernelIR, point: DesignPoint): Estimate {
  const pragmasById = new Map(point.loopPragmas.map((pragma) => [pragma.loopId, pragma]));
  const breakdown = new Map<string, EstimateCostPoint>();

  // Deepest loops first so a parent can add its children's cycle estimates.
  const byDepth = [...kernel.loops].sort((a, b) => b.depth - a.depth || a.id.localeCompare(b.id));
  for (const loop of byDepth) {
    const pragma = pragmasById.get(loop.id) ?? {
      loopId: loop.id, tileable: false, parallelFactor: 1, pipelineII: 1, unrollFactor: 1, tileFactor: 1,
    };
    const childCycles = breakdown.size === 0
      ? 0
      : kernel.loops
        .filter((candidate) => candidate.parentId === loop.id)
        .reduce((total, child) => total + (breakdown.get(child.id)?.loopCycles ?? 0), 0);
    breakdown.set(loop.id, loopCyclesFor(loop, pragma, childCycles));
  }

  const topLevelCycles = kernel.loops
    .filter((loop) => loop.parentId === null)
    .reduce((total, loop) => total + (breakdown.get(loop.id)?.loopCycles ?? 0), 0);

  const straightLineOps = kernel.ops.filter((op) => op.loopPath.length === 0);
  const straightLineCycles = straightLineOps.reduce((total, op) => total + op.arithmetic.length + 1, 0);
  const latencyCycles = Math.max(1, topLevelCycles + straightLineCycles + (kernel.ops.length > 0 ? 1 : 0));

  const resources = estimateResources(kernel, point);
  const { bytes, elements } = estimateMemoryTraffic(kernel, point);
  const activity = estimateActivity(breakdown, latencyCycles, straightLineCycles);

  const scores: EstimateScores = {
    latency: latencyCycles,
    area: resources.lut / 1000 + resources.dsp / 50 + resources.bram / 8 + resources.ff / 2000,
    memory: bytes / 4096,
    power: 0,
  };
  scores.power = scores.area * (0.55 + 0.45 * activity);

  const caveats = [
    'analytical model only: no synthesis, scheduling, binding, memory inference, placement, or timing analysis was run',
    'resource numbers are op-mix estimates, not mapped cell or block counts; they are not comparable to a synthesis report',
    'the estimate assumes every requested pragma is legal; no dependence, port-conflict, or resource-sharing check was performed',
    'if/else arms are counted together, so the op mix is a worst case unless the branches are known to be exclusive at run time',
  ];
  if (kernel.opMix['/'] > 0 || kernel.opMix['%'] > 0) {
    caveats.push('divide/modulo are modelled as single operators with fixed LUT costs; real latency and area depend strongly on the target library');
  }
  if (point.loopPragmas.some((pragma) => pragma.parallelFactor * pragma.unrollFactor > 1)) {
    caveats.push('parallel/unroll factors assume the loop has no carried dependence; loop-carried scalars in the IR make that assumption suspect');
  }

  return {
    estimatorVersion: ESTIMATOR_VERSION,
    label: ESTIMATOR_LABEL,
    designPoint: { id: point.id, pragmaKey: point.pragmaKey },
    latencyCycles,
    activity,
    resources,
    memoryTrafficBytes: bytes,
    memoryTrafficElements: elements,
    scores,
    opMix: { ...kernel.opMix },
    loopBreakdown: kernel.loops.map((loop) => breakdown.get(loop.id) as EstimateCostPoint),
    straightLineOps: straightLineOps.length,
    assumptions: [...ESTIMATOR_ASSUMPTIONS],
    caveats,
  };
}

export function estimateDesignPoints(kernel: KernelIR, points: DesignPoint[]): Estimate[] {
  return points.map((point) => estimateDesignPoint(kernel, point));
}

function estimateResources(kernel: KernelIR, point: DesignPoint): EstimateResources {
  let dsp = 0;
  let lut = 0;
  let ff = 0;
  let replicatedOps = 0;

  for (const op of kernel.ops) {
    const replication = replicationFor(op, kernel, point);
    replicatedOps += replication;
    const mix = countArithmetic(op);
    dsp += mix['*'] * replication * ESTIMATOR_CONSTANTS.dspPerMultiply;
    lut += mix['+'] * replication * ESTIMATOR_CONSTANTS.lutPerAddSub;
    lut += mix['-'] * replication * ESTIMATOR_CONSTANTS.lutPerAddSub;
    lut += mix['/'] * replication * ESTIMATOR_CONSTANTS.lutPerDivide;
    lut += mix['%'] * replication * ESTIMATOR_CONSTANTS.lutPerModulo;
    const pragma = pragmaFor(point, op.loopPath[op.loopPath.length - 1] ?? '');
    ff += replication * Math.max(1, pragma.pipelineII) * ESTIMATOR_CONSTANTS.ffPerPipelineStage;
  }

  for (const pragma of point.loopPragmas) {
    lut += ESTIMATOR_CONSTANTS.lutPerLoopControl * Math.max(1, pragma.tileFactor > 1 ? 2 : 1);
  }
  ff += kernel.scalars.length * ESTIMATOR_CONSTANTS.elementBits;
  lut += Math.max(8, kernel.loops.length * 8);

  const bram = kernel.arrays.reduce(
    (total, array) => total + Math.max(1, Math.ceil((array.size * array.elementBytes) / ESTIMATOR_CONSTANTS.bramBytes)),
    0,
  );

  return { dsp, lut, ff, bram, replicatedOps };
}

function countArithmetic(op: PrimitiveOp): Record<'+' | '-' | '*' | '/' | '%', number> {
  const mix: Record<'+' | '-' | '*' | '/' | '%', number> = { '+': 0, '-': 0, '*': 0, '/': 0, '%': 0 };
  for (const arithmetic of op.arithmetic) mix[arithmetic] += 1;
  return mix;
}

function estimateMemoryTraffic(kernel: KernelIR, point: DesignPoint): { bytes: number; elements: number } {
  const loopsById = new Map(kernel.loops.map((loop) => [loop.id, loop]));
  let elements = 0;

  for (const access of kernel.arrayAccesses) {
    let executions = 1;
    let reuse = 1;
    for (const loopId of access.loopPath) {
      const loop = loopsById.get(loopId);
      if (!loop) continue;
      const pragma = pragmaFor(point, loopId);
      executions *= loop.tripCount;
      if (pragma.tileFactor > 1) reuse *= pragma.tileFactor;
    }
    elements += executions / reuse;
  }

  const bytes = elements * ESTIMATOR_CONSTANTS.bytesPerElement;
  return { bytes, elements };
}

function estimateActivity(
  breakdown: Map<string, EstimateCostPoint>,
  latencyCycles: number,
  straightLineCycles: number,
): number {
  const totalCycleWork = latencyCycles;
  if (totalCycleWork <= 0) return 1;
  const busy = straightLineCycles + [...breakdown.values()]
    .reduce((total, entry) => total + entry.iterations * Math.max(1, entry.ownOpCount), 0);
  return Math.max(0.05, Math.min(1, busy / totalCycleWork));
}

/** Weighted comparison score. Metrics must come from one population to be comparable. */
export function weightedScore(estimate: Estimate, weights: EstimateWeights): number {
  const total = weights.latency + weights.area + weights.memory + weights.power;
  if (total <= 0) throw new Error('at least one objective weight must be greater than zero');
  return (
    (weights.latency * estimate.scores.latency +
      weights.area * estimate.scores.area +
      weights.memory * estimate.scores.memory +
      weights.power * estimate.scores.power) / total
  );
}
