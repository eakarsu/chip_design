/**
 * Parameter sweep runner.
 *
 * Two strategies:
 *   - 'grid'   — full Cartesian product of `steps` evenly-spaced points per dim
 *   - 'random' — `samples` uniform draws from the box
 *
 * Use this when you want the *whole landscape* (heatmap, Pareto plot,
 * sensitivity), not the single best point — that's what Bayesian
 * optimization is for.
 *
 * The objective signature matches `bayesopt.ts` so the same callback can
 * be plugged into either runner.
 */

import type { ParamDim } from './bayesopt';

export interface SweepOptions {
  strategy: 'grid' | 'random';
  /** For 'grid': points per dim. For 'random': total samples. */
  steps?: number;
  samples?: number;
  seed?: number;
}

export interface SweepTrial {
  params: Record<string, number>;
  value: number;
}

export interface SweepResult {
  strategy: 'grid' | 'random';
  trials: SweepTrial[];
  best: SweepTrial;
  worst: SweepTrial;
  mean: number;
  stddev: number;
  runtimeMs: number;
}

function mulberry32(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gridPoints(dims: ParamDim[], steps: number): number[][] {
  // Cartesian product. Caller is responsible for keeping the size sane.
  const axes = dims.map(d => {
    if (steps <= 1) return [d.min];
    const arr: number[] = [];
    for (let i = 0; i < steps; i++) {
      let v = d.min + (i / (steps - 1)) * (d.max - d.min);
      if (d.integer) v = Math.round(v);
      arr.push(v);
    }
    // Dedupe (matters for integer dims with steps > range).
    return Array.from(new Set(arr));
  });
  let acc: number[][] = [[]];
  for (const axis of axes) {
    const next: number[][] = [];
    for (const prefix of acc) for (const v of axis) next.push([...prefix, v]);
    acc = next;
  }
  return acc;
}

export async function parameterSweep(
  dims: ParamDim[],
  objective: (params: Record<string, number>) => number | Promise<number>,
  opts: SweepOptions,
): Promise<SweepResult> {
  const t0 = performance.now();
  if (dims.length === 0) throw new Error('parameterSweep: at least one dim required');

  let pointVecs: number[][];
  if (opts.strategy === 'grid') {
    pointVecs = gridPoints(dims, opts.steps ?? 5);
  } else {
    const rand = mulberry32(opts.seed ?? 0);
    const n = opts.samples ?? 50;
    pointVecs = Array.from({ length: n }, () =>
      dims.map(d => {
        let v = d.min + rand() * (d.max - d.min);
        if (d.integer) v = Math.round(v);
        return v;
      }),
    );
  }

  const trials: SweepTrial[] = [];
  for (const vec of pointVecs) {
    const params: Record<string, number> = {};
    dims.forEach((d, i) => { params[d.name] = vec[i]; });
    const value = await objective(params);
    trials.push({ params, value });
  }

  const values = trials.map(t => t.value);
  const mean = values.reduce((a, b) => a + b, 0) / Math.max(1, values.length);
  const variance = values.reduce((a, v) => a + (v - mean) ** 2, 0) / Math.max(1, values.length);
  const sorted = [...trials].sort((a, b) => a.value - b.value);

  return {
    strategy: opts.strategy,
    trials,
    best: sorted[0],
    worst: sorted[sorted.length - 1],
    mean,
    stddev: Math.sqrt(variance),
    runtimeMs: performance.now() - t0,
  };
}
