/**
 * Pareto multi-objective solver + visualization helpers.
 *
 * In chip design you're almost never optimizing a single number — you're
 * trading timing slack against power, area against congestion, density
 * against wirelength. This module takes an unstructured list of candidate
 * points in N-dimensional objective space and returns the Pareto frontier
 * (the set of non-dominated points) plus utility helpers for plotting.
 *
 * All objectives are assumed *minimized*; callers pass negated values for
 * any metric they want to maximize.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

export interface Candidate<TMeta = Record<string, unknown>> {
  id: string;
  /** Objective vector, one entry per axis. Lower = better for every axis. */
  objectives: number[];
  /** Optional free-form metadata (e.g. "ran in 42 ms, used 3 buffers"). */
  meta?: TMeta;
}

export interface ParetoResult<TMeta = Record<string, unknown>> {
  /** The non-dominated set. */
  frontier: Candidate<TMeta>[];
  /** Everything else. */
  dominated: Candidate<TMeta>[];
  /** For each candidate, how many others dominate it. */
  dominanceCount: Record<string, number>;
}

/**
 * Compute the Pareto frontier. O(n²) — fine for the hundreds-of-candidates
 * range we see in real sweeps. For tens of thousands of candidates you'd
 * want Kung's algorithm; not needed here.
 */
export function paretoFrontier<TMeta>(cands: Candidate<TMeta>[]): ParetoResult<TMeta> {
  const n = cands.length;
  const dominated = new Array(n).fill(false);
  const counts: Record<string, number> = {};

  for (let i = 0; i < n; i++) counts[cands[i].id] = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      if (dominates(cands[j].objectives, cands[i].objectives)) {
        dominated[i] = true;
        counts[cands[i].id]++;
      }
    }
  }
  const frontier: Candidate<TMeta>[] = [];
  const dom: Candidate<TMeta>[] = [];
  for (let i = 0; i < n; i++) (dominated[i] ? dom : frontier).push(cands[i]);
  return { frontier, dominated: dom, dominanceCount: counts };
}

/** Strict Pareto dominance: a ≤ b elementwise AND a < b on at least one axis. */
export function dominates(a: number[], b: number[]): boolean {
  if (a.length !== b.length) throw new Error('dominates(): dimension mismatch');
  let anyStrict = false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] > b[i]) return false;
    if (a[i] < b[i]) anyStrict = true;
  }
  return anyStrict;
}

/**
 * Weighted-sum scalarization — pick the candidate that minimizes
 *   Σ wᵢ · (oᵢ − min_i) / (max_i − min_i)
 * after min-max normalization across the candidate set. Useful as a
 * "single best" pointer alongside the full frontier.
 */
export function bestByWeights<TMeta>(
  cands: Candidate<TMeta>[],
  weights: number[],
): Candidate<TMeta> | undefined {
  if (cands.length === 0) return undefined;
  const dim = cands[0].objectives.length;
  if (weights.length !== dim) throw new Error('weights length mismatch');
  const mins = new Array(dim).fill(Infinity);
  const maxs = new Array(dim).fill(-Infinity);
  for (const c of cands) {
    for (let i = 0; i < dim; i++) {
      if (c.objectives[i] < mins[i]) mins[i] = c.objectives[i];
      if (c.objectives[i] > maxs[i]) maxs[i] = c.objectives[i];
    }
  }
  const norm = (v: number, lo: number, hi: number) =>
    hi === lo ? 0 : (v - lo) / (hi - lo);
  let best: Candidate<TMeta> | undefined;
  let bestScore = Infinity;
  for (const c of cands) {
    let s = 0;
    for (let i = 0; i < dim; i++) {
      s += weights[i] * norm(c.objectives[i], mins[i], maxs[i]);
    }
    if (s < bestScore) { bestScore = s; best = c; }
  }
  return best;
}

/**
 * Hypervolume indicator relative to a reference (worst) point. Standard
 * multi-objective quality metric — bigger = frontier covers more space.
 *
 * Implemented via the WFG-style recursive formula for 2D/3D — we fall
 * back to a Monte Carlo estimator beyond 3 dimensions.
 */
export function hypervolume(
  frontier: Candidate<any>[], reference: number[],
): number {
  if (frontier.length === 0) return 0;
  const dim = reference.length;
  if (dim === 2) return hv2d(frontier, reference);
  if (dim === 3) return hv3d(frontier, reference);
  return hvMonteCarlo(frontier, reference, 10_000);
}

function hv2d(front: Candidate<any>[], ref: number[]): number {
  // Sort by x ascending.
  const pts = [...front].sort((a, b) => a.objectives[0] - b.objectives[0]);
  let area = 0;
  let prevY = ref[1];
  for (const p of pts) {
    const [x, y] = p.objectives;
    if (x >= ref[0] || y >= ref[1]) continue;
    const w = ref[0] - x;
    const h = prevY - y;
    if (h > 0) area += w * h;
    if (y < prevY) prevY = y;
  }
  return area;
}

function hv3d(front: Candidate<any>[], ref: number[]): number {
  // Sweep z from low to high. After admitting point i, the active set covers
  // the slab between z_i and the next point's z (or ref[2]).
  const pts = [...front].sort((a, b) => a.objectives[2] - b.objectives[2]);
  let total = 0;
  const active: Candidate<any>[] = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (p.objectives[2] >= ref[2]) break;
    active.push({ ...p, objectives: p.objectives.slice(0, 2) });
    const nextZ = i + 1 < pts.length
      ? Math.min(pts[i + 1].objectives[2], ref[2])
      : ref[2];
    const slab = nextZ - p.objectives[2];
    if (slab > 0) total += hv2d(active, [ref[0], ref[1]]) * slab;
  }
  return total;
}

function hvMonteCarlo(front: Candidate<any>[], ref: number[], samples: number): number {
  const dim = ref.length;
  const mins = new Array(dim).fill(Infinity);
  for (const p of front) for (let i = 0; i < dim; i++) if (p.objectives[i] < mins[i]) mins[i] = p.objectives[i];
  let hit = 0;
  for (let s = 0; s < samples; s++) {
    const pt = new Array(dim);
    for (let i = 0; i < dim; i++) pt[i] = mins[i] + Math.random() * (ref[i] - mins[i]);
    if (front.some(f => dominates(f.objectives, pt))) hit++;
  }
  let vol = 1;
  for (let i = 0; i < dim; i++) vol *= (ref[i] - mins[i]);
  return (hit / samples) * vol;
}

/* --------------------------------------------------------------------- */
/* Viz-ready output                                                        */
/* --------------------------------------------------------------------- */

export interface VizPoint {
  id: string;
  x: number; y: number; z?: number;
  isFrontier: boolean;
  dominatedBy: number;
}

/**
 * Shape candidates into an array of points suitable for a scatter plot.
 * Only the first 3 objectives are used (x, y, z).
 */
export function toVizPoints<TMeta>(
  cands: Candidate<TMeta>[], result: ParetoResult<TMeta>,
): VizPoint[] {
  const onFront = new Set(result.frontier.map(c => c.id));
  return cands.map(c => ({
    id: c.id,
    x: c.objectives[0],
    y: c.objectives[1],
    z: c.objectives[2],
    isFrontier: onFront.has(c.id),
    dominatedBy: result.dominanceCount[c.id] ?? 0,
  }));
}
