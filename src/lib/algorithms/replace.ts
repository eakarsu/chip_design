/**
 * RePlAce-style analytical placer.
 *
 * Minimizes
 *     f(x) = WL(x) + λ · D(x)
 * where
 *     WL(x) is the weighted-average-model (WA) smooth wirelength, and
 *     D(x)  is an "electrostatic" density penalty.
 *
 * Both terms are differentiable so we can run gradient descent with
 * Nesterov-like momentum. We normalize the two gradients each step so the
 * density term doesn't steamroll wirelength at small chips or vice-versa.
 *
 * This is NOT a drop-in for commercial RePlAce — it skips the FFT Poisson
 * solve (we use a direct finite-bin density field) and legalization, so it
 * produces a well-distributed *global* placement that a legalizer can then
 * snap to rows. That matches how our toolchain consumes it downstream.
 *
 * Weighted-average wirelength model (Hsu et al.):
 *   WA_x(net) = Σ xᵢ·exp(xᵢ/γ) / Σ exp(xᵢ/γ)
 *             − Σ xᵢ·exp(−xᵢ/γ) / Σ exp(−xᵢ/γ)
 * γ controls how sharply we approximate the hard HPWL max/min. Small γ →
 * closer to HPWL but stiff gradients. We use γ = 8 % of chip width.
 */

import { Cell, Net, PlacementResult } from '@/types/algorithms';

export interface RePlAceOptions {
  chipWidth: number;
  chipHeight: number;
  /** Max iterations. Default 200. */
  iterations?: number;
  /** Initial density weight λ. Default 0.01. */
  lambda?: number;
  /** Multiplier applied to λ every iteration (annealing-like ramp). Default 1.03. */
  lambdaGrowth?: number;
  /** Learning-rate scale. Default 0.5 × γ. */
  stepSize?: number;
  /** Grid bins on each side. Default max(16, √N). */
  bins?: number;
  /** Random seed for the initial placement. Default 1. */
  seed?: number;
  /** Abort once the gradient norm falls below this threshold. */
  convergenceTol?: number;
}

interface Ctx {
  cells: Cell[];
  nets: Net[];
  pinCellIdx: Map<string, number>; // pin id → cell index
  W: number; H: number;
  binsX: number; binsY: number;
  binW: number; binH: number;
  /** Smoothing parameter for the WA wirelength model. */
  gamma: number;
}

/** Deterministic tiny PRNG so test seeds reproduce. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

export function runRePlAce(
  cells: Cell[],
  nets: Net[],
  opts: RePlAceOptions,
): PlacementResult {
  const t0 = Date.now();
  const iterations = opts.iterations ?? 200;
  const bins = opts.bins ?? Math.max(16, Math.ceil(Math.sqrt(cells.length)));
  const lambdaGrowth = opts.lambdaGrowth ?? 1.03;
  const conv = opts.convergenceTol ?? 1e-4;
  const rand = rng(opts.seed ?? 1);

  // Clone cells so we don't mutate caller state.
  const placed: Cell[] = cells.map(c => ({
    ...c,
    position: c.position ?? {
      x: rand() * opts.chipWidth,
      y: rand() * opts.chipHeight,
    },
  }));

  // Pin-id → cell-index map for O(1) net gradients.
  const pinCellIdx = new Map<string, number>();
  placed.forEach((c, i) => { for (const p of c.pins) pinCellIdx.set(p.id, i); });

  const gamma = Math.max(1e-6, 0.08 * opts.chipWidth);
  const ctx: Ctx = {
    cells: placed, nets,
    pinCellIdx,
    W: opts.chipWidth, H: opts.chipHeight,
    binsX: bins, binsY: bins,
    binW: opts.chipWidth / bins,
    binH: opts.chipHeight / bins,
    gamma,
  };

  const stepSize = opts.stepSize ?? 0.5 * gamma;
  let lambda = opts.lambda ?? 0.01;

  // Nesterov momentum state.
  const vx = new Float64Array(placed.length);
  const vy = new Float64Array(placed.length);
  const mu = 0.9;

  const convergenceData: number[] = [];

  for (let it = 0; it < iterations; it++) {
    const { gx, gy } = computeGradients(ctx, lambda);

    // Normalize to chip-relative scale so the step size is meaningful.
    let maxAbs = 0;
    for (let i = 0; i < gx.length; i++) {
      const a = Math.abs(gx[i]); if (a > maxAbs) maxAbs = a;
      const b = Math.abs(gy[i]); if (b > maxAbs) maxAbs = b;
    }
    if (maxAbs === 0) break;
    const scale = stepSize / maxAbs;

    for (let i = 0; i < placed.length; i++) {
      vx[i] = mu * vx[i] - scale * gx[i];
      vy[i] = mu * vy[i] - scale * gy[i];
      let nx = (placed[i].position!.x) + vx[i];
      let ny = (placed[i].position!.y) + vy[i];
      // Reflect at die boundary — prevents cells from drifting out.
      const halfW = placed[i].width  * 0.5;
      const halfH = placed[i].height * 0.5;
      if (nx < halfW) { nx = halfW; vx[i] = 0; }
      if (ny < halfH) { ny = halfH; vy[i] = 0; }
      if (nx > opts.chipWidth  - halfW) { nx = opts.chipWidth  - halfW; vx[i] = 0; }
      if (ny > opts.chipHeight - halfH) { ny = opts.chipHeight - halfH; vy[i] = 0; }
      placed[i].position = { x: nx, y: ny };
    }

    const hpwl = hpwlOf(ctx);
    convergenceData.push(hpwl);
    lambda *= lambdaGrowth;

    if (maxAbs < conv) break;
  }

  return {
    success: true,
    cells: placed,
    totalWirelength: hpwlOf(ctx),
    overlap: densityOverflow(ctx),
    runtime: Date.now() - t0,
    iterations: convergenceData.length,
    convergenceData,
  };
}

/* --------------------------------------------------------------------- */
/* Gradients                                                              */
/* --------------------------------------------------------------------- */

function computeGradients(ctx: Ctx, lambda: number): { gx: Float64Array; gy: Float64Array } {
  const n = ctx.cells.length;
  const gx = new Float64Array(n);
  const gy = new Float64Array(n);

  // Wirelength gradient — for each net, distribute via the WA model.
  for (const net of ctx.nets) {
    const idxs: number[] = [];
    for (const pid of net.pins) {
      const i = ctx.pinCellIdx.get(pid);
      if (i !== undefined) idxs.push(i);
    }
    if (idxs.length < 2) continue;
    accumulateWAGradient(ctx, idxs, gx, gy, /*axis=*/'x');
    accumulateWAGradient(ctx, idxs, gx, gy, /*axis=*/'y');
  }

  // Density gradient — steepest-descent on bin overflow. Each bin pushes
  // the cells it contains outward proportional to its overflow.
  const { overflow, binDensity } = binDensities(ctx);
  if (lambda > 0 && overflow > 0) {
    for (let i = 0; i < n; i++) {
      const c = ctx.cells[i];
      const cx = c.position!.x;
      const cy = c.position!.y;
      // Dx = Σ_b d_b · (cx − bx_center) / r  summed over bins the cell overlaps
      const ix0 = Math.max(0, Math.floor((cx - c.width/2) / ctx.binW));
      const ix1 = Math.min(ctx.binsX - 1, Math.floor((cx + c.width/2) / ctx.binW));
      const iy0 = Math.max(0, Math.floor((cy - c.height/2) / ctx.binH));
      const iy1 = Math.min(ctx.binsY - 1, Math.floor((cy + c.height/2) / ctx.binH));
      let dx = 0, dy = 0;
      for (let by = iy0; by <= iy1; by++) {
        for (let bx = ix0; bx <= ix1; bx++) {
          const d = binDensity[by * ctx.binsX + bx];
          if (d <= 1) continue; // only overfull bins push
          const bxc = (bx + 0.5) * ctx.binW;
          const byc = (by + 0.5) * ctx.binH;
          dx += (cx - bxc) * (d - 1);
          dy += (cy - byc) * (d - 1);
        }
      }
      gx[i] += lambda * dx;
      gy[i] += lambda * dy;
    }
  }

  return { gx, gy };
}

/** Weighted-Average wirelength model — gradient contribution for one axis. */
function accumulateWAGradient(
  ctx: Ctx, idxs: number[], gx: Float64Array, gy: Float64Array, axis: 'x' | 'y',
) {
  const g = ctx.gamma;
  let sumEp = 0, sumEn = 0, sumXEp = 0, sumXEn = 0;
  const coords: number[] = [];
  for (const i of idxs) {
    const v = axis === 'x' ? ctx.cells[i].position!.x : ctx.cells[i].position!.y;
    coords.push(v);
  }
  // Numerical stability: subtract max.
  let maxV = -Infinity, minV = Infinity;
  for (const v of coords) { if (v > maxV) maxV = v; if (v < minV) minV = v; }
  for (const v of coords) {
    sumEp += Math.exp((v - maxV) / g);
    sumEn += Math.exp((minV - v) / g);
    sumXEp += v * Math.exp((v - maxV) / g);
    sumXEn += v * Math.exp((minV - v) / g);
  }
  // ∂WA/∂xᵢ = (eᵢ⁺·(1 + (xᵢ − A⁺)/γ)) / Σe⁺  −  (eᵢ⁻·(1 − (xᵢ − A⁻)/γ)) / Σe⁻
  const Ap = sumXEp / sumEp;
  const An = sumXEn / sumEn;
  for (let k = 0; k < idxs.length; k++) {
    const i = idxs[k];
    const v = coords[k];
    const ep = Math.exp((v - maxV) / g);
    const en = Math.exp((minV - v) / g);
    const dpos = ep * (1 + (v - Ap) / g) / sumEp;
    const dneg = en * (1 - (v - An) / g) / sumEn;
    const grad = dpos - dneg;
    if (axis === 'x') gx[i] += grad; else gy[i] += grad;
  }
}

/* --------------------------------------------------------------------- */
/* Density bookkeeping                                                    */
/* --------------------------------------------------------------------- */

function binDensities(ctx: Ctx): { overflow: number; binDensity: Float64Array } {
  const { binsX, binsY, binW, binH } = ctx;
  const area = new Float64Array(binsX * binsY);
  for (const c of ctx.cells) {
    const x0 = c.position!.x - c.width / 2;
    const x1 = c.position!.x + c.width / 2;
    const y0 = c.position!.y - c.height / 2;
    const y1 = c.position!.y + c.height / 2;
    const ix0 = Math.max(0, Math.floor(x0 / binW));
    const ix1 = Math.min(binsX - 1, Math.floor(x1 / binW));
    const iy0 = Math.max(0, Math.floor(y0 / binH));
    const iy1 = Math.min(binsY - 1, Math.floor(y1 / binH));
    for (let by = iy0; by <= iy1; by++) {
      for (let bx = ix0; bx <= ix1; bx++) {
        const bx0 = bx * binW, bx1 = (bx + 1) * binW;
        const by0 = by * binH, by1 = (by + 1) * binH;
        const ow = Math.max(0, Math.min(x1, bx1) - Math.max(x0, bx0));
        const oh = Math.max(0, Math.min(y1, by1) - Math.max(y0, by0));
        area[by * binsX + bx] += ow * oh;
      }
    }
  }
  const binCap = binW * binH;
  const binDensity = new Float64Array(binsX * binsY);
  let over = 0;
  for (let i = 0; i < area.length; i++) {
    binDensity[i] = area[i] / binCap;
    if (binDensity[i] > 1) over += area[i] - binCap;
  }
  return { overflow: over, binDensity };
}

function densityOverflow(ctx: Ctx): number {
  return binDensities(ctx).overflow;
}

function hpwlOf(ctx: Ctx): number {
  let total = 0;
  for (const net of ctx.nets) {
    let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
    let any = false;
    for (const pid of net.pins) {
      const i = ctx.pinCellIdx.get(pid);
      if (i === undefined) continue;
      any = true;
      const p = ctx.cells[i].position!;
      if (p.x < xmin) xmin = p.x;
      if (p.x > xmax) xmax = p.x;
      if (p.y < ymin) ymin = p.y;
      if (p.y > ymax) ymax = p.y;
    }
    if (any) total += (xmax - xmin) + (ymax - ymin);
  }
  return total;
}
