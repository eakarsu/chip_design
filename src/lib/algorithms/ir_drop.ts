/**
 * Power-grid IR-drop solver.
 *
 * Models the on-chip power distribution network as a 2-D resistive mesh.
 * Each tile has an unknown node voltage V[i,j]. Tiles are connected by
 * edge resistors `R` (uniform). VDD pads at known boundary tiles inject a
 * fixed voltage `V_dd`. Cell current draw enters as a per-tile load
 * `I[i,j]` to GND.
 *
 * Solving Kirchhoff at each interior node yields:
 *   ∑_neighbours (V_n − V_ij) / R  =  I[i,j]
 *
 * That's a sparse symmetric positive-definite linear system A·V = b. We
 * build it as a list of (row, col, val) entries and solve with the same
 * Jacobi-preconditioned conjugate gradient used by the analytical placer.
 *
 * Output is V[row][col]; the IR drop heatmap is `V_dd − V[r][c]`.
 *
 * Approximations:
 *   - Single global supply (no separate VDD/VDDQ rails)
 *   - Uniform sheet resistance per tile-edge
 *   - DC analysis (no decap or transient effects)
 *
 * That's enough fidelity for early-stage planning; sign-off uses
 * SPICE-level tools.
 */

export interface IRDropInput {
  cols: number;
  rows: number;
  /** Edge resistance between adjacent tiles, in ohms. */
  edgeR: number;
  /** Supply voltage at the pad tiles, in volts. */
  vdd: number;
  /** [row][col] current draw to ground in amps. Optional — defaults to 0. */
  loadI?: number[][];
  /** List of (row, col) tiles tied to VDD. Must contain at least one. */
  pads: { row: number; col: number }[];
  /** CG iteration cap. Default 500. */
  maxIter?: number;
  /** CG tolerance. Default 1e-9. */
  tol?: number;
}

export interface IRDropResult {
  /** [row][col] node voltage. */
  voltage: number[][];
  /** [row][col] IR drop = vdd − voltage. */
  drop: number[][];
  /** Maximum drop (worst-case). */
  worstDrop: number;
  /** Mean drop across non-pad tiles. */
  meanDrop: number;
  iterations: number;
  residual: number;
  runtimeMs: number;
}

interface SparseRow { idx: number[]; val: number[]; rhs: number; diag: number; }

export function solveIRDrop(p: IRDropInput): IRDropResult {
  const t0 = performance.now();
  const { cols, rows, edgeR, vdd } = p;
  if (cols <= 0 || rows <= 0) throw new Error('solveIRDrop: cols/rows must be positive');
  if (edgeR <= 0) throw new Error('solveIRDrop: edgeR must be positive');
  if (!p.pads || p.pads.length === 0) throw new Error('solveIRDrop: at least one pad required');

  const N = cols * rows;
  const padSet = new Set<number>(p.pads.map(({ row, col }) => row * cols + col));
  const idx = (r: number, c: number) => r * cols + c;
  const G = 1 / edgeR;

  // Build sparse rows.
  const A: SparseRow[] = Array.from({ length: N }, () => ({ idx: [], val: [], rhs: 0, diag: 0 }));

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = idx(r, c);
      if (padSet.has(i)) {
        // Dirichlet: V_i = vdd.  Encode as 1·V_i = vdd.
        A[i].diag = 1;
        A[i].rhs = vdd;
        continue;
      }
      const load = p.loadI?.[r]?.[c] ?? 0;
      // Sum over neighbours.
      let diag = 0;
      const push = (j: number) => {
        diag += G;
        // For pad neighbours, contribution becomes a known-RHS term (G·vdd).
        if (padSet.has(j)) A[i].rhs += G * vdd;
        else { A[i].idx.push(j); A[i].val.push(-G); }
      };
      if (r > 0)        push(idx(r - 1, c));
      if (r < rows - 1) push(idx(r + 1, c));
      if (c > 0)        push(idx(r, c - 1));
      if (c < cols - 1) push(idx(r, c + 1));
      // Right-hand side: −I  (current flowing out of node to ground).
      A[i].rhs -= load;
      A[i].diag = diag;
    }
  }

  // Sparse y = A·x.
  const matMul = (x: Float64Array, y: Float64Array) => {
    for (let i = 0; i < N; i++) {
      let s = A[i].diag * x[i];
      const r = A[i];
      for (let k = 0; k < r.idx.length; k++) s += r.val[k] * x[r.idx[k]];
      y[i] = s;
    }
  };

  // Jacobi-preconditioned CG.
  const x = new Float64Array(N).fill(vdd); // warm start at supply
  const r = new Float64Array(N);
  const z = new Float64Array(N);
  const pVec = new Float64Array(N);
  const Ap = new Float64Array(N);
  const tmp = new Float64Array(N);

  matMul(x, tmp);
  for (let i = 0; i < N; i++) r[i] = A[i].rhs - tmp[i];
  for (let i = 0; i < N; i++) z[i] = r[i] / (A[i].diag || 1);
  for (let i = 0; i < N; i++) pVec[i] = z[i];

  let rzOld = 0;
  for (let i = 0; i < N; i++) rzOld += r[i] * z[i];

  const maxIter = p.maxIter ?? 500;
  const tol = (p.tol ?? 1e-9) ** 2 * (vdd * vdd * N);

  let iter = 0, residSq = 0;
  for (; iter < maxIter; iter++) {
    matMul(pVec, Ap);
    let pAp = 0;
    for (let i = 0; i < N; i++) pAp += pVec[i] * Ap[i];
    if (pAp === 0) break;
    const alpha = rzOld / pAp;
    for (let i = 0; i < N; i++) {
      x[i] += alpha * pVec[i];
      r[i] -= alpha * Ap[i];
    }
    residSq = 0;
    for (let i = 0; i < N; i++) residSq += r[i] * r[i];
    if (residSq < tol) { iter++; break; }
    for (let i = 0; i < N; i++) z[i] = r[i] / (A[i].diag || 1);
    let rzNew = 0;
    for (let i = 0; i < N; i++) rzNew += r[i] * z[i];
    const beta = rzNew / rzOld;
    for (let i = 0; i < N; i++) pVec[i] = z[i] + beta * pVec[i];
    rzOld = rzNew;
  }

  // Reshape, compute drop stats.
  const voltage: number[][] = Array.from({ length: rows }, () => new Array(cols).fill(0));
  const drop: number[][]    = Array.from({ length: rows }, () => new Array(cols).fill(0));
  let worstDrop = 0, sumDrop = 0, nNonPad = 0;
  for (let rIdx = 0; rIdx < rows; rIdx++) {
    for (let c = 0; c < cols; c++) {
      const i = rIdx * cols + c;
      voltage[rIdx][c] = x[i];
      const d = vdd - x[i];
      drop[rIdx][c] = d;
      if (!padSet.has(i)) {
        if (d > worstDrop) worstDrop = d;
        sumDrop += d;
        nNonPad++;
      }
    }
  }

  return {
    voltage, drop,
    worstDrop,
    meanDrop: nNonPad > 0 ? sumDrop / nNonPad : 0,
    iterations: iter,
    residual: Math.sqrt(residSq),
    runtimeMs: performance.now() - t0,
  };
}
