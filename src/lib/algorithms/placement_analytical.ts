/**
 * Analytical (quadratic) placement.
 *
 * Real GORDIAN-/RePlAce-style global placer. We model wirelength with the
 * quadratic clique model: every two-pin connection on a net contributes a
 * spring `½ k (xi − xj)²` to the cost. Multi-pin nets are decomposed into
 * cliques with weight `2/(k−1)` so the minimum stays equivalent to HPWL
 * for two-pin nets and is a good proxy for many-pin nets.
 *
 * Minimizing `½ xᵀ Q x − bᵀ x` with respect to x gives the linear system
 * `Q x = b`, where:
 *
 *   - Q is the (movable × movable) Hessian (Laplacian of the spring graph
 *     restricted to movable cells)
 *   - b absorbs the contribution of fixed pins (cell-pin offsets + boundary
 *     anchors), so the unconstrained minimum lands inside the chip.
 *
 * The x and y dimensions are independent so we solve two scalar systems.
 *
 * We solve with **Conjugate Gradient** (Q is SPD), which converges in O(√κ)
 * iterations and never needs a dense factorization. CG only touches Q via
 * matrix-vector products, so we keep Q as an adjacency list.
 *
 * After the analytical solve, we apply boundary clamping. Use a downstream
 * legalizer (tetris/abacus) to remove residual overlap.
 */

import type {
  PlacementParams,
  PlacementResult,
  Cell,
  Net,
} from '@/types/algorithms';

interface Edge { j: number; w: number; }

/** Clique-weighted adjacency over movable cells (and anchors → b vector). */
interface SpringGraph {
  /** Diagonal of Q: sum of incident weights + anchor weights. */
  diag: number[];
  /** Off-diagonal Q entries (symmetric, store once per edge in adj[i]). */
  adj: Edge[][];
  /** Right-hand side accumulated from anchors (chip-boundary corner pull). */
  bx: number[];
  by: number[];
}

function buildSpringGraph(
  cells: Cell[],
  nets: Net[],
  chipWidth: number,
  chipHeight: number,
  anchorWeight: number,
): SpringGraph {
  const n = cells.length;
  const idxOf = new Map<string, number>();
  cells.forEach((c, i) => idxOf.set(c.id, i));

  // Map every pin id -> { cellIdx, offsetX, offsetY }.
  const pinIndex = new Map<string, { cell: number; ox: number; oy: number }>();
  cells.forEach((c, i) => {
    for (const p of c.pins) {
      pinIndex.set(p.id, { cell: i, ox: p.position.x, oy: p.position.y });
    }
  });

  const diag = new Array(n).fill(0);
  const bx = new Array(n).fill(0);
  const by = new Array(n).fill(0);
  // Use a per-row map to coalesce multiple net edges between same pair.
  const edgeMap: Map<number, number>[] = Array.from({ length: n }, () => new Map());

  for (const net of nets) {
    const pins = net.pins
      .map(pid => pinIndex.get(pid))
      .filter((p): p is { cell: number; ox: number; oy: number } => !!p);
    if (pins.length < 2) continue;
    const k = pins.length;
    const w = (net.weight ?? 1) * (2 / (k - 1)); // clique weight

    for (let a = 0; a < pins.length; a++) {
      for (let b = a + 1; b < pins.length; b++) {
        const i = pins[a].cell, j = pins[b].cell;
        if (i === j) continue;
        // Pin offsets shift the equilibrium: the spring connects
        //   (xi + ox_a) ↔ (xj + ox_b)
        // so the b-vector picks up w·(ox_b − ox_a) on row i (and the negative
        // on row j) — same for y.
        const dox = pins[b].ox - pins[a].ox;
        const doy = pins[b].oy - pins[a].oy;
        diag[i] += w; diag[j] += w;
        bx[i] += w * dox; bx[j] -= w * dox;
        by[i] += w * doy; by[j] -= w * doy;

        // Symmetric off-diagonal: Q[i][j] -= w
        edgeMap[i].set(j, (edgeMap[i].get(j) ?? 0) - w);
        edgeMap[j].set(i, (edgeMap[j].get(i) ?? 0) - w);
      }
    }
  }

  // Anchor each cell to the chip center so the system is non-singular when
  // a cell has no nets, and keep the placement bounded.
  const ax = chipWidth / 2;
  const ay = chipHeight / 2;
  for (let i = 0; i < n; i++) {
    diag[i] += anchorWeight;
    bx[i] += anchorWeight * ax;
    by[i] += anchorWeight * ay;
  }

  const adj: Edge[][] = edgeMap.map(m => {
    const arr: Edge[] = [];
    for (const [j, w] of m) arr.push({ j, w });
    return arr;
  });

  return { diag, adj, bx, by };
}

/** Q v product — Q is built from diag + adj. */
function qMul(g: SpringGraph, v: number[], out: number[]): void {
  const n = v.length;
  for (let i = 0; i < n; i++) out[i] = g.diag[i] * v[i];
  for (let i = 0; i < n; i++) {
    let s = 0;
    const row = g.adj[i];
    for (let k = 0; k < row.length; k++) {
      s += row[k].w * v[row[k].j];
    }
    out[i] += s;
  }
}

/** Solve Q x = b via Jacobi-preconditioned conjugate gradient. */
function solveCG(g: SpringGraph, b: number[], maxIter = 400, tol = 1e-5): number[] {
  const n = b.length;
  const x = new Array(n).fill(0);
  const r = b.slice();
  const tmp = new Array(n).fill(0);

  // Jacobi preconditioner = 1/diag.
  const Minv = g.diag.map(d => (d > 1e-12 ? 1 / d : 1));
  let z = r.map((ri, i) => ri * Minv[i]);
  let p = z.slice();
  let rzOld = dot(r, z);
  const bnorm = Math.max(1e-12, Math.sqrt(dot(b, b)));

  for (let it = 0; it < maxIter; it++) {
    qMul(g, p, tmp);
    const alpha = rzOld / Math.max(1e-30, dot(p, tmp));
    for (let i = 0; i < n; i++) {
      x[i] += alpha * p[i];
      r[i] -= alpha * tmp[i];
    }
    if (Math.sqrt(dot(r, r)) / bnorm < tol) break;
    z = r.map((ri, i) => ri * Minv[i]);
    const rzNew = dot(r, z);
    const beta = rzNew / Math.max(1e-30, rzOld);
    for (let i = 0; i < n; i++) p[i] = z[i] + beta * p[i];
    rzOld = rzNew;
  }
  return x;
}

function dot(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

/* --------------------------------------------------------------------- */
/* Public entry                                                            */
/* --------------------------------------------------------------------- */

/**
 * Returns a PlacementResult with all cells placed at their analytically
 * optimal centers, clamped to the chip area. Overlap is *not* removed —
 * pipe through tetris/abacus afterwards if needed.
 */
export function quadraticPlacement(params: PlacementParams): PlacementResult {
  const start = performance.now();
  const cells = params.cells.map(c => ({ ...c })); // shallow copy so we don't mutate input
  const n = cells.length;
  if (n === 0) {
    return {
      success: true, cells: [], totalWirelength: 0, overlap: 0, runtime: 0,
      iterations: 0,
    } as PlacementResult;
  }

  // Anchor weight controls how strongly cells are pulled toward chip center
  // when a cell has no nets — keep small so real net forces dominate.
  const anchorWeight = 0.01;
  const g = buildSpringGraph(cells, params.nets, params.chipWidth, params.chipHeight, anchorWeight);

  const xs = solveCG(g, g.bx);
  const ys = solveCG(g, g.by);

  // Clamp to chip area, account for cell footprint.
  for (let i = 0; i < n; i++) {
    const c = cells[i];
    const x = Math.max(0, Math.min(params.chipWidth - c.width, xs[i] - c.width / 2));
    const y = Math.max(0, Math.min(params.chipHeight - c.height, ys[i] - c.height / 2));
    c.position = { x, y };
  }

  return {
    success: true,
    cells,
    totalWirelength: hpwl(cells, params.nets),
    overlap: 0, // populated by caller
    runtime: performance.now() - start,
    iterations: 1,
  };
}

function hpwl(cells: Cell[], nets: Net[]): number {
  const pinAt = new Map<string, { x: number; y: number }>();
  for (const c of cells) {
    if (!c.position) continue;
    for (const p of c.pins) {
      pinAt.set(p.id, {
        x: c.position.x + p.position.x,
        y: c.position.y + p.position.y,
      });
    }
  }
  let total = 0;
  for (const net of nets) {
    let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity, k = 0;
    for (const pid of net.pins) {
      const p = pinAt.get(pid);
      if (!p) continue;
      if (p.x < xMin) xMin = p.x; if (p.x > xMax) xMax = p.x;
      if (p.y < yMin) yMin = p.y; if (p.y > yMax) yMax = p.y;
      k++;
    }
    if (k > 0) total += (xMax - xMin + yMax - yMin) * (net.weight ?? 1);
  }
  return total;
}
