/**
 * "FEA-lite" solver for two related 2D Poisson problems on the chip:
 *
 *   1. IR drop     ∇·(σ ∇V) = −J      (current-conservation on the power grid)
 *   2. Temperature ∇·(k ∇T) = −P      (steady-state heat-diffusion)
 *
 * Both boil down to solving  A x = b  on a 5-point finite-difference grid
 * over Nx×Ny tiles with Dirichlet boundary conditions on the outer edge
 * (pad voltages for IR, ambient temp for thermal). A is sparse, symmetric,
 * positive-definite — a textbook job for conjugate gradient with a simple
 * Jacobi preconditioner.
 *
 * This is *lite* because we skip:
 *   - non-uniform grids (uniform tile spacing only)
 *   - anisotropic conductivity (σ and k are scalar per tile)
 *   - 3-D stackup (single layer)
 *
 * That's still enough to catch hot spots and brownouts early in the flow,
 * and it runs in seconds on designs with <1M tiles.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

export interface GridSpec {
  nx: number; ny: number;
  /** Physical tile spacing (µm). */
  dx: number; dy: number;
}

export interface IRDropInput {
  grid: GridSpec;
  /** Current draw per tile (A). 2D row-major array of size nx*ny. */
  currentMap: Float64Array | number[];
  /** Sheet resistance of the power-grid layer at this tile (Ω/sq). */
  sheetR: Float64Array | number[];
  /**
   * Boundary pad voltages (V). Either a Dirichlet map of size nx*ny where
   * NaN = "interior, no pad" and finite = "hold this voltage", or a flat
   * value treated as all four edges.
   */
  padVoltage: Float64Array | number[] | number;
}

export interface ThermalInput {
  grid: GridSpec;
  /** Power density per tile (W). */
  powerMap: Float64Array | number[];
  /** Thermal conductivity (W/(m·K)) — scalar or per-tile. */
  k: Float64Array | number[] | number;
  /** Ambient boundary temperature (°C). */
  tAmbient?: number;
  /** Heat-transfer coefficient (W/(m²·K)) for Robin BC — optional. */
  h?: number;
}

export interface SolverOutput {
  field: Float64Array;
  /** Maximum value in the interior. */
  peak: number;
  /** Tile index (i,j) where the peak occurred. */
  peakAt: { i: number; j: number };
  iterations: number;
  residual: number;
}

export interface SolverOptions {
  maxIterations?: number;
  tolerance?: number;
}

/* --------------------------------------------------------------------- */
/* IR drop                                                                */
/* --------------------------------------------------------------------- */

export function solveIRDrop(inp: IRDropInput, opts: SolverOptions = {}): SolverOutput {
  const { nx, ny } = inp.grid;
  const n = nx * ny;

  const currents = toFloat(inp.currentMap, n);
  const rs = toFloat(inp.sheetR, n);
  const pads = typeof inp.padVoltage === 'number'
    ? edgeDirichlet(nx, ny, inp.padVoltage)
    : toFloat(inp.padVoltage as any, n);

  // For IR drop, we solve   ∇·(σ ∇V) = −J   → on a uniform grid with
  // isotropic sheet resistance σ = 1 / R_s (per-sq), the 5-point stencil is:
  //
  //   Σ σ_k · (V_k − V_c) = J_c · tileArea
  //
  // Writing σ_c = 1/R_s[c] we use the harmonic mean of adjacent cells for
  // the conductance on each edge.

  const A = buildLaplacian(inp.grid, rs, /*useHarmonic=*/true);
  const b = new Float64Array(n);
  const tileArea = inp.grid.dx * inp.grid.dy;
  for (let i = 0; i < n; i++) b[i] = currents[i] * tileArea;

  // Enforce Dirichlet: wherever pads[i] is finite, fix that tile.
  for (let i = 0; i < n; i++) {
    if (Number.isFinite(pads[i])) {
      fixRow(A, i, pads[i], b);
    }
  }

  const x = cg(A, b, opts);
  return summarise(x, nx, ny);
}

/* --------------------------------------------------------------------- */
/* Thermal                                                                */
/* --------------------------------------------------------------------- */

export function solveThermal(inp: ThermalInput, opts: SolverOptions = {}): SolverOutput {
  const { nx, ny } = inp.grid;
  const n = nx * ny;
  const tAmb = inp.tAmbient ?? 25;

  const power = toFloat(inp.powerMap, n);
  const k = typeof inp.k === 'number'
    ? new Float64Array(n).fill(inp.k)
    : toFloat(inp.k as any, n);

  // Conductivity = 1/k for the Laplacian's harmonic mean helper, so we
  // invert.
  const resistivity = new Float64Array(n);
  for (let i = 0; i < n; i++) resistivity[i] = 1 / Math.max(1e-12, k[i]);

  const A = buildLaplacian(inp.grid, resistivity, true);
  const b = new Float64Array(n);
  const tileArea = inp.grid.dx * inp.grid.dy;
  for (let i = 0; i < n; i++) b[i] = power[i] * tileArea;

  // Dirichlet: outer edge held at ambient.
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      if (i === 0 || i === nx - 1 || j === 0 || j === ny - 1) {
        fixRow(A, j * nx + i, tAmb, b);
      }
    }
  }

  const x = cg(A, b, opts);
  return summarise(x, nx, ny);
}

/* --------------------------------------------------------------------- */
/* Linear algebra                                                         */
/* --------------------------------------------------------------------- */

/**
 * Sparse symmetric matrix in CSR-ish form. We store diag + four offsets
 * (±1, ±nx) since the stencil is fixed on a uniform grid.
 */
interface Stencil {
  n: number;
  nx: number;
  diag: Float64Array;
  east: Float64Array;  // coupling to +x neighbour
  north: Float64Array; // coupling to +y neighbour
}

function buildLaplacian(grid: GridSpec, resistivity: Float64Array, harmonic: boolean): Stencil {
  const { nx, ny, dx, dy } = grid;
  const n = nx * ny;
  const diag = new Float64Array(n);
  const east = new Float64Array(n);
  const north = new Float64Array(n);
  const cxx = dy / dx;   // edge conductance scaling for a unit-σ cell in x-direction
  const cyy = dx / dy;

  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const c = j * nx + i;
      if (i < nx - 1) {
        const r = harmonic
          ? harmMean(resistivity[c], resistivity[c + 1])
          : (resistivity[c] + resistivity[c + 1]) * 0.5;
        const cond = cxx / r;
        east[c] = -cond;
        diag[c] += cond;
        diag[c + 1] += cond;
      }
      if (j < ny - 1) {
        const r = harmonic
          ? harmMean(resistivity[c], resistivity[c + nx])
          : (resistivity[c] + resistivity[c + nx]) * 0.5;
        const cond = cyy / r;
        north[c] = -cond;
        diag[c] += cond;
        diag[c + nx] += cond;
      }
    }
  }
  return { n, nx, diag, east, north };
}

function harmMean(a: number, b: number): number {
  const ap = Math.max(a, 1e-30);
  const bp = Math.max(b, 1e-30);
  return (2 * ap * bp) / (ap + bp);
}

/** Fix row i to Dirichlet value v: diag=1, off-diagonals zeroed, b[i]=v. */
function fixRow(A: Stencil, i: number, v: number, b: Float64Array): void {
  A.diag[i] = 1;
  // Zero the couplings from this row — symmetric matrix: also patch
  // neighbouring rows so the matrix stays symmetric. This preserves CG.
  const { nx } = A;
  if (i % nx !== 0 && A.east[i - 1] !== 0) {
    // East coupling from (i-1) → i: move its contribution into b[i-1] then zero it.
    b[i - 1] -= A.east[i - 1] * v;
    A.east[i - 1] = 0;
  }
  if ((i % nx) !== nx - 1) {
    if (A.east[i] !== 0) {
      b[i + 1] -= A.east[i] * v;
      A.east[i] = 0;
    }
  }
  if (i >= nx && A.north[i - nx] !== 0) {
    b[i - nx] -= A.north[i - nx] * v;
    A.north[i - nx] = 0;
  }
  if (i < A.n - nx && A.north[i] !== 0) {
    b[i + nx] -= A.north[i] * v;
    A.north[i] = 0;
  }
  b[i] = v;
}

/** y = A x for our 5-point stencil. */
function apply(A: Stencil, x: Float64Array, y: Float64Array): void {
  const { n, nx } = A;
  y.fill(0);
  for (let i = 0; i < n; i++) {
    y[i] += A.diag[i] * x[i];
    if ((i % nx) !== nx - 1 && A.east[i] !== 0) {
      y[i]     += A.east[i] * x[i + 1];
      y[i + 1] += A.east[i] * x[i];
    }
    if (i < n - nx && A.north[i] !== 0) {
      y[i]      += A.north[i] * x[i + nx];
      y[i + nx] += A.north[i] * x[i];
    }
  }
}

/** Jacobi-preconditioned conjugate gradient. */
function cg(A: Stencil, b: Float64Array, opts: SolverOptions): Float64Array {
  const n = A.n;
  const x = new Float64Array(n); // zero init
  const r = new Float64Array(n);
  const z = new Float64Array(n);
  const p = new Float64Array(n);
  const Ap = new Float64Array(n);

  // r = b − Ax  (x=0 so r=b)
  for (let i = 0; i < n; i++) r[i] = b[i];

  // Jacobi preconditioner: z = M⁻¹ r where M = diag(A).
  for (let i = 0; i < n; i++) z[i] = A.diag[i] !== 0 ? r[i] / A.diag[i] : r[i];
  for (let i = 0; i < n; i++) p[i] = z[i];

  let rz = dot(r, z);
  const bnorm = Math.sqrt(dot(b, b)) || 1;
  const tol = (opts.tolerance ?? 1e-8) * bnorm;
  const maxIt = opts.maxIterations ?? 2000;

  let iter = 0;
  let residual = Math.sqrt(rz);
  for (; iter < maxIt; iter++) {
    apply(A, p, Ap);
    const pAp = dot(p, Ap);
    if (pAp === 0) break;
    const alpha = rz / pAp;
    for (let i = 0; i < n; i++) {
      x[i] += alpha * p[i];
      r[i] -= alpha * Ap[i];
    }
    residual = Math.sqrt(dot(r, r));
    if (residual < tol) { iter++; break; }
    for (let i = 0; i < n; i++) z[i] = A.diag[i] !== 0 ? r[i] / A.diag[i] : r[i];
    const rzNew = dot(r, z);
    const beta = rzNew / rz;
    for (let i = 0; i < n; i++) p[i] = z[i] + beta * p[i];
    rz = rzNew;
  }
  (x as any).__iter = iter;
  (x as any).__res = residual;
  return x;
}

function dot(a: Float64Array, b: Float64Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

function summarise(field: Float64Array, nx: number, ny: number): SolverOutput {
  let peak = -Infinity, pi = 0, pj = 0;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const v = field[j * nx + i];
      if (v > peak) { peak = v; pi = i; pj = j; }
    }
  }
  return {
    field, peak, peakAt: { i: pi, j: pj },
    iterations: (field as any).__iter ?? 0,
    residual: (field as any).__res ?? 0,
  };
}

function toFloat(src: Float64Array | number[], expectedLen: number): Float64Array {
  if (src instanceof Float64Array) {
    if (src.length !== expectedLen) throw new Error(`array length mismatch: ${src.length} vs ${expectedLen}`);
    return src;
  }
  if (!Array.isArray(src)) throw new Error('expected array input');
  if (src.length !== expectedLen) throw new Error(`array length mismatch: ${src.length} vs ${expectedLen}`);
  return Float64Array.from(src);
}

/** Helper: produce a Dirichlet map where only the outer edge is pinned. */
export function edgeDirichlet(nx: number, ny: number, value: number): Float64Array {
  const out = new Float64Array(nx * ny);
  for (let i = 0; i < out.length; i++) out[i] = NaN;
  for (let i = 0; i < nx; i++) {
    out[i] = value;
    out[(ny - 1) * nx + i] = value;
  }
  for (let j = 0; j < ny; j++) {
    out[j * nx] = value;
    out[j * nx + nx - 1] = value;
  }
  return out;
}
