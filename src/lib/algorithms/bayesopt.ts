/**
 * In-process Bayesian optimizer for hyperparameter tuning.
 *
 * Implements:
 *   - Gaussian Process surrogate with squared-exponential kernel
 *   - Expected Improvement (EI) acquisition
 *   - Uniform random candidate sampling for the inner argmax (cheap & robust;
 *     a proper L-BFGS gradient walk would be overkill at our problem sizes)
 *
 * The intended use case is auto-tuning: given a black-box `objective(x)` that
 * runs an algorithm with parameters `x` and returns a scalar to minimize
 * (e.g. wirelength), pick the next set of parameters to try, then warm-start
 * the GP and repeat for a fixed budget. Everything lives in memory — no
 * process spawning, no scikit/torch dependency.
 *
 * References: Mockus 1978 (EI), Rasmussen & Williams 2006 (GPML chapter 2).
 */

export interface ParamDim {
  name: string;
  /** Inclusive lower bound. */
  min: number;
  /** Inclusive upper bound. */
  max: number;
  /** When true, round the proposed value to the nearest integer. */
  integer?: boolean;
}

export interface BayesOptOptions {
  /** Number of initial random samples before the GP kicks in. Default 5. */
  initialSamples?: number;
  /** Total evaluations (initial + GP-driven). Default 20. */
  budget?: number;
  /** GP length-scale; larger = smoother. Default = 1/4 of normalized range. */
  lengthScale?: number;
  /** Observation noise variance. Default 1e-6. */
  noise?: number;
  /** Candidates considered per acquisition step. Default 256. */
  candidatesPerStep?: number;
  /** Seed for reproducibility. Default 0. */
  seed?: number;
}

export interface Trial {
  params: Record<string, number>;
  /** Lower is better. */
  value: number;
}

export interface BayesOptResult {
  trials: Trial[];
  best: Trial;
  /** Convergence trace: best-so-far value after each evaluation. */
  trace: number[];
  runtimeMs: number;
}

/* --------------------------------------------------------------------- */
/* RNG (mulberry32 — small, deterministic, good enough)                  */
/* --------------------------------------------------------------------- */

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* --------------------------------------------------------------------- */
/* Gaussian Process                                                       */
/* --------------------------------------------------------------------- */

/** Squared-exponential / RBF kernel in normalized [0,1]^d space. */
function rbfKernel(a: number[], b: number[], lengthScale: number): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    s += d * d;
  }
  return Math.exp(-s / (2 * lengthScale * lengthScale));
}

/** Cholesky decomposition (lower triangular). Mutates a copy of A in-place. */
function cholesky(A: number[][]): number[][] {
  const n = A.length;
  const L: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = A[i][j];
      for (let k = 0; k < j; k++) sum -= L[i][k] * L[j][k];
      if (i === j) {
        // Numerical floor; keeps PSD-ish matrices solvable.
        L[i][j] = Math.sqrt(Math.max(sum, 1e-12));
      } else {
        L[i][j] = sum / L[j][j];
      }
    }
  }
  return L;
}

/** Solve L · y = b (forward substitution). */
function forwardSub(L: number[][], b: number[]): number[] {
  const n = L.length;
  const y = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    let s = b[i];
    for (let j = 0; j < i; j++) s -= L[i][j] * y[j];
    y[i] = s / L[i][i];
  }
  return y;
}

/** Solve Lᵀ · x = y (back substitution). */
function backSub(L: number[][], y: number[]): number[] {
  const n = L.length;
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = y[i];
    for (let j = i + 1; j < n; j++) s -= L[j][i] * x[j];
    x[i] = s / L[i][i];
  }
  return x;
}

/** Standard normal PDF / CDF via Abramowitz approximation. */
function normPdf(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}
function normCdf(x: number): number {
  // Abramowitz & Stegun 26.2.17 — max error ~7.5e-8.
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x) / Math.sqrt(2);
  const t = 1 / (1 + 0.3275911 * ax);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t
              * Math.exp(-ax * ax);
  return 0.5 * (1 + sign * y);
}

/* --------------------------------------------------------------------- */
/* Public API                                                             */
/* --------------------------------------------------------------------- */

export type ObjectiveFn = (params: Record<string, number>) => number | Promise<number>;

export async function bayesianOptimize(
  dims: ParamDim[],
  objective: ObjectiveFn,
  options: BayesOptOptions = {},
): Promise<BayesOptResult> {
  const t0 = performance.now();
  const initial = options.initialSamples ?? 5;
  const budget = Math.max(initial + 1, options.budget ?? 20);
  const lengthScale = options.lengthScale ?? 0.25;
  const noise = options.noise ?? 1e-6;
  const candidatesPerStep = options.candidatesPerStep ?? 256;
  const rand = mulberry32(options.seed ?? 0);

  if (dims.length === 0) {
    throw new Error('bayesianOptimize: at least one parameter dimension required');
  }

  const denormalize = (x: number[]): Record<string, number> => {
    const out: Record<string, number> = {};
    dims.forEach((d, i) => {
      let v = d.min + x[i] * (d.max - d.min);
      if (d.integer) v = Math.round(v);
      out[d.name] = v;
    });
    return out;
  };

  const sampleUniform = (): number[] => dims.map(() => rand());

  const xs: number[][] = [];
  const ys: number[] = [];
  const trials: Trial[] = [];
  const trace: number[] = [];
  let bestY = Infinity;
  let bestParams: Record<string, number> = {};

  const recordTrial = async (xn: number[]) => {
    const params = denormalize(xn);
    const value = await objective(params);
    xs.push(xn);
    ys.push(value);
    trials.push({ params, value });
    if (value < bestY) { bestY = value; bestParams = params; }
    trace.push(bestY);
  };

  // Phase 1: initial random samples (warm the surrogate).
  for (let i = 0; i < Math.min(initial, budget); i++) {
    await recordTrial(sampleUniform());
  }

  // Phase 2: GP-driven loop.
  while (xs.length < budget) {
    // Build kernel matrix K + σ²I.
    const n = xs.length;
    const K: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
    for (let i = 0; i < n; i++) {
      for (let j = 0; j <= i; j++) {
        const k = rbfKernel(xs[i], xs[j], lengthScale);
        K[i][j] = k;
        K[j][i] = k;
      }
      K[i][i] += noise;
    }
    const L = cholesky(K);
    // α = K⁻¹ y  (solve L Lᵀ α = y).
    const alpha = backSub(L, forwardSub(L, ys));

    // Inner argmax via random candidate sweep.
    let bestEi = -Infinity;
    let bestX: number[] = sampleUniform();
    for (let c = 0; c < candidatesPerStep; c++) {
      const xc = sampleUniform();
      // Cross-covariance k_*.
      const kStar = xs.map(xi => rbfKernel(xi, xc, lengthScale));
      // μ = k_*ᵀ α.
      let mu = 0;
      for (let i = 0; i < n; i++) mu += kStar[i] * alpha[i];
      // v = L⁻¹ k_*  →  σ² = k(x*,x*) − vᵀv.
      const v = forwardSub(L, kStar);
      let vv = 0;
      for (let i = 0; i < n; i++) vv += v[i] * v[i];
      const sigma2 = Math.max(rbfKernel(xc, xc, lengthScale) - vv, 1e-12);
      const sigma = Math.sqrt(sigma2);
      // Expected Improvement (minimization).
      const improvement = bestY - mu;
      const z = improvement / sigma;
      const ei = improvement * normCdf(z) + sigma * normPdf(z);
      if (ei > bestEi) { bestEi = ei; bestX = xc; }
    }

    await recordTrial(bestX);
  }

  return {
    trials,
    best: { params: bestParams, value: bestY },
    trace,
    runtimeMs: performance.now() - t0,
  };
}
