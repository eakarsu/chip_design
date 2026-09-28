/**
 * Placement algorithms that the UI historically labelled "DeepPlace", "GNN",
 * "RL" and "Transformer".
 *
 * There is no neural network, no learned model and no GPU code path in this
 * file. Earlier revisions advertised all of those while actually applying
 * seeded random jitter and reporting `overlap: 0`. This version keeps the
 * public function names (callers in `placement.ts` and the API routes depend
 * on them) but implements deterministic optimization methods instead:
 *
 *   runDeepPlace            smooth-HPWL (log-sum-exp) gradient descent with
 *                           momentum, backtracking step control and a
 *                           bin-density spreading penalty.
 *   runGNNPlacement         GORDIAN-style quadratic (clique) placement solved
 *                           with conjugate gradient over the connectivity
 *                           graph, then legalized. A graph/matrix method —
 *                           not a graph neural network.
 *   runRLEnhancedPlacement  deterministic local search (coordinate descent +
 *                           pairwise swaps). No policy, value function,
 *                           reward model or learning of any kind.
 *   runTransformerPlacement connectivity/position weighted (softmax)
 *                           smoothing of cell positions, then legalized. An
 *                           attention-shaped averaging heuristic — not a
 *                           trained transformer.
 *
 * All four are pure functions of their inputs. The only random ingredient is
 * a seeded mulberry32 PRNG used for the initial spread; the seed defaults to a
 * hash of the input, so identical inputs always produce identical outputs.
 * The global random source is never consulted.
 *
 * The optimizer reports the true weighted HPWL (pin offsets included) it
 * achieves and the true pairwise overlap area of the returned cells; nothing
 * is hard-coded to zero.
 */

import {
  Cell,
  Net,
  PlacementAlgorithm,
  PlacementResult,
} from '@/types/algorithms';
import { abacusLegalization } from '../legalization';
import { quadraticPlacement } from '../placement_analytical';

const EPS = 1e-9;

/* ------------------------------------------------------------------ */
/* Deterministic RNG + input hash                                      */
/* ------------------------------------------------------------------ */

/** mulberry32: tiny, fast, fully deterministic 32-bit PRNG. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a hash of everything that can change the placement problem. */
function hashPlacementInput(
  cells: Cell[],
  nets: Net[],
  chipWidth: number,
  chipHeight: number
): number {
  let h = 2166136261 >>> 0;
  const mix = (text: string) => {
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
  };
  mix(`${chipWidth}|${chipHeight}|${cells.length}|${nets.length}`);
  for (const c of cells) mix(`${c.id}:${c.width}x${c.height}`);
  for (const n of nets) mix(`${n.id}:${n.weight}:${n.pins.join(',')}`);
  return h >>> 0;
}

/* ------------------------------------------------------------------ */
/* Shared problem representation                                       */
/* ------------------------------------------------------------------ */

interface PinRef {
  cell: number;
  ox: number;
  oy: number;
}

interface NetRef {
  weight: number;
  pins: PinRef[];
}

function buildNetRefs(cells: Cell[], nets: Net[]): NetRef[] {
  const pinIndex = new Map<string, { cell: number; ox: number; oy: number }>();
  cells.forEach((c, i) => {
    for (const p of c.pins) {
      pinIndex.set(p.id, { cell: i, ox: p.position.x, oy: p.position.y });
    }
  });

  const refs: NetRef[] = [];
  for (const net of nets) {
    const pins: PinRef[] = [];
    for (const pid of net.pins) {
      const p = pinIndex.get(pid);
      if (p) pins.push(p);
    }
    if (pins.length >= 2) {
      refs.push({ weight: net.weight ?? 1, pins });
    }
  }
  return refs;
}

/* ------------------------------------------------------------------ */
/* True (non-smooth) objective: weighted HPWL + overlap/density        */
/* ------------------------------------------------------------------ */

function netHpwlAt(
  ref: NetRef,
  xs: number[],
  ys: number[],
  override?: { cell: number; x: number; y: number }
): number {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of ref.pins) {
    const x = override && override.cell === p.cell ? override.x + p.ox : xs[p.cell] + p.ox;
    const y = override && override.cell === p.cell ? override.y + p.oy : ys[p.cell] + p.oy;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return ref.weight * (maxX - minX + maxY - minY);
}

function totalHpwl(refs: NetRef[], xs: number[], ys: number[]): number {
  let total = 0;
  for (const ref of refs) total += netHpwlAt(ref, xs, ys);
  return total;
}

function totalOverlapArea(cells: Cell[]): number {
  let area = 0;
  for (let i = 0; i < cells.length; i++) {
    const a = cells[i].position;
    if (!a) continue;
    for (let j = i + 1; j < cells.length; j++) {
      const b = cells[j].position;
      if (!b) continue;
      const w = Math.min(a.x + cells[i].width, b.x + cells[j].width) - Math.max(a.x, b.x);
      const h = Math.min(a.y + cells[i].height, b.y + cells[j].height) - Math.max(a.y, b.y);
      if (w > 0 && h > 0) area += w * h;
    }
  }
  return area;
}

/* ------------------------------------------------------------------ */
/* Smooth HPWL gradient (log-sum-exp / weighted-average model)         */
/* ------------------------------------------------------------------ */

/**
 * Adds the exact gradient of the log-sum-exp surrogate
 *   γ·log Σ exp(x_i/γ) + γ·log Σ exp(−x_i/γ)
 * (which converges to max−min as γ→0) to `gx`/`gy`. Both the positive and
 * negative softmax are max-shifted so the exponentials cannot overflow.
 */
function addSmoothWireGradients(
  refs: NetRef[],
  xs: number[],
  ys: number[],
  gamma: number,
  gx: number[],
  gy: number[]
): void {
  const g = Math.max(gamma, EPS);
  for (const ref of refs) {
    for (const axis of [0, 1] as const) {
      const coord = axis === 0 ? xs : ys;
      const off = axis === 0 ? 'ox' : 'oy';
      const grad = axis === 0 ? gx : gy;

      let maxPos = -Infinity;
      let maxNeg = -Infinity;
      for (const p of ref.pins) {
        const v = coord[p.cell] + p[off];
        if (v > maxPos) maxPos = v;
        if (-v > maxNeg) maxNeg = -v;
      }
      let sumPos = 0;
      let sumNeg = 0;
      for (const p of ref.pins) {
        const v = coord[p.cell] + p[off];
        sumPos += Math.exp((v - maxPos) / g);
        sumNeg += Math.exp((maxNeg - v) / g);
      }
      for (const p of ref.pins) {
        const v = coord[p.cell] + p[off];
        const softPos = Math.exp((v - maxPos) / g) / Math.max(sumPos, EPS);
        const softNeg = Math.exp((maxNeg - v) / g) / Math.max(sumNeg, EPS);
        grad[p.cell] += ref.weight * (softPos - softNeg);
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/* Bin-density spreading penalty + gradient (bilinear splatting)       */
/* ------------------------------------------------------------------ */

interface DensityModel {
  binsX: number;
  binsY: number;
  binW: number;
  binH: number;
  binArea: number;
}

function makeDensityModel(n: number, chipWidth: number, chipHeight: number): DensityModel {
  const dim = Math.max(1, Math.min(32, Math.ceil(Math.sqrt(Math.max(1, n)))));
  const binsX = chipWidth > 0 ? dim : 1;
  const binsY = chipHeight > 0 ? dim : 1;
  const binW = chipWidth > 0 ? chipWidth / binsX : 1;
  const binH = chipHeight > 0 ? chipHeight / binsY : 1;
  return { binsX, binsY, binW, binH, binArea: Math.max(binW * binH, EPS) };
}

/**
 * Density penalty `Σ max(0, density_bin − target)²` with its analytic
 * gradient w.r.t. cell origins. Cells are splatted onto the grid with
 * bilinear weights; moving a cell shifts weight between adjacent bins, and
 * the derivative of that shift is ±1/binSize (capped to zero at the clamped
 * grid border).
 */
function densityPenaltyAndGradient(
  xs: number[],
  ys: number[],
  cells: Cell[],
  chipWidth: number,
  chipHeight: number,
  targetDensity: number,
  gx: number[],
  gy: number[]
): number {
  const n = cells.length;
  if (n === 0) return 0;
  const model = makeDensityModel(n, chipWidth, chipHeight);
  const { binsX, binsY, binW, binH, binArea } = model;

  const used = new Float64Array(binsX * binsY);
  const ix0 = new Int32Array(n);
  const iy0 = new Int32Array(n);
  const tx = new Float64Array(n);
  const ty = new Float64Array(n);
  const area = new Float64Array(n);
  const dtdx = new Float64Array(n);
  const dtdy = new Float64Array(n);

  for (let i = 0; i < n; i++) {
    const c = cells[i];
    const cellArea = Math.max(0, c.width) * Math.max(0, c.height);
    area[i] = cellArea;

    const fx = (xs[i] + c.width / 2) / binW - 0.5;
    const fy = (ys[i] + c.height / 2) / binH - 0.5;

    const rawIx = Math.floor(fx);
    const rawIy = Math.floor(fy);
    const cx = Math.min(Math.max(rawIx, 0), Math.max(0, binsX - 2));
    const cy = Math.min(Math.max(rawIy, 0), Math.max(0, binsY - 2));
    ix0[i] = cx;
    iy0[i] = cy;
    tx[i] = rawIx === cx ? Math.min(Math.max(fx - cx, 0), 1) : rawIx < 0 ? 0 : 1;
    ty[i] = rawIy === cy ? Math.min(Math.max(fy - cy, 0), 1) : rawIy < 0 ? 0 : 1;
    // The bilinear coordinate only moves with the cell while it sits strictly
    // inside the grid; at a clamped border bin the weights are constant.
    dtdx[i] = rawIx === cx ? 1 / binW : 0;
    dtdy[i] = rawIy === cy ? 1 / binH : 0;

    const w00 = (1 - tx[i]) * (1 - ty[i]);
    const w10 = tx[i] * (1 - ty[i]);
    const w01 = (1 - tx[i]) * ty[i];
    const w11 = tx[i] * ty[i];
    const right = Math.min(cx + 1, binsX - 1);
    const top = Math.min(cy + 1, binsY - 1);

    used[cy * binsX + cx] += w00 * cellArea;
    used[cy * binsX + right] += w10 * cellArea;
    used[top * binsX + cx] += w01 * cellArea;
    used[top * binsX + right] += w11 * cellArea;
  }

  const excess = new Float64Array(binsX * binsY);
  let penalty = 0;
  for (let b = 0; b < excess.length; b++) {
    const d = used[b] / binArea - targetDensity;
    if (d > 0) {
      excess[b] = d;
      penalty += d * d;
    }
  }
  if (penalty === 0) return 0;
  if (gx.length === 0) return penalty;

  for (let i = 0; i < n; i++) {
    const cx = ix0[i];
    const cy = iy0[i];
    const right = Math.min(cx + 1, binsX - 1);
    const top = Math.min(cy + 1, binsY - 1);
    const p00 = excess[cy * binsX + cx];
    const p10 = excess[cy * binsX + right];
    const p01 = excess[top * binsX + cx];
    const p11 = excess[top * binsX + right];
    const scale = (2 * area[i]) / binArea;

    // d(weight)/d(centerX) = ∓dtdx for the left/right columns.
    gx[i] += scale * dtdx[i] * (p10 * (1 - ty[i]) + p11 * ty[i] - p00 * (1 - ty[i]) - p01 * ty[i]);
    gy[i] += scale * dtdy[i] * (p01 * (1 - tx[i]) + p11 * tx[i] - p00 * (1 - tx[i]) - p10 * tx[i]);
  }

  return penalty;
}

/* ------------------------------------------------------------------ */
/* Deterministic initial spread                                        */
/* ------------------------------------------------------------------ */

function initialPositions(
  cells: Cell[],
  chipWidth: number,
  chipHeight: number,
  seed: number
): { xs: number[]; ys: number[] } {
  const rng = mulberry32(seed);
  const xs: number[] = [];
  const ys: number[] = [];
  for (const c of cells) {
    xs.push(rng() * Math.max(0, chipWidth - c.width));
    ys.push(rng() * Math.max(0, chipHeight - c.height));
  }
  return { xs, ys };
}

/**
 * Deterministic seeded starting placement used by every solver in this file.
 * Exported so callers/tests can measure the objective the solvers improve on.
 */
export function createInitialPlacement(
  cells: Cell[],
  nets: Net[],
  chipWidth: number,
  chipHeight: number,
  seed?: number
): Cell[] {
  const effectiveSeed = seed ?? hashPlacementInput(cells, nets, chipWidth, chipHeight);
  const { xs, ys } = initialPositions(cells, chipWidth, chipHeight, effectiveSeed);
  return cells.map((c, i) => ({ ...c, position: { x: xs[i], y: ys[i] } }));
}

/** True weighted HPWL (cell-pin offsets included) of a placed design. */
export function computePlacementHPWL(cells: Cell[], nets: Net[]): number {
  const refs = buildNetRefs(cells, nets);
  const xs = cells.map((c) => c.position?.x ?? 0);
  const ys = cells.map((c) => c.position?.y ?? 0);
  return totalHpwl(refs, xs, ys);
}

/** True total pairwise overlap area of a placed design. */
export function computePlacementOverlap(cells: Cell[]): number {
  return totalOverlapArea(cells);
}

/* ------------------------------------------------------------------ */
/* Legalization + wirelength-preserving polishing                      */
/* ------------------------------------------------------------------ */

function overlapsAny(
  i: number,
  nx: number,
  ny: number,
  cells: Cell[],
  xs: number[],
  ys: number[]
): boolean {
  const w = cells[i].width;
  const h = cells[i].height;
  for (let j = 0; j < cells.length; j++) {
    if (j === i) continue;
    if (nx < xs[j] + cells[j].width && nx + w > xs[j] && ny < ys[j] + cells[j].height && ny + h > ys[j]) {
      return true;
    }
  }
  return false;
}

/**
 * Coordinate-descent polish on the true HPWL. Only moves that decrease HPWL
 * and keep the cell from overlapping any other cell are accepted, so an
 * already-legal placement stays legal.
 */
function polishLegalPositions(
  refs: NetRef[],
  cells: Cell[],
  xs: number[],
  ys: number[],
  chipWidth: number,
  chipHeight: number,
  sweeps: number
): number {
  const n = cells.length;
  if (n < 2 || sweeps <= 0) return totalHpwl(refs, xs, ys);

  const netsByCell: number[][] = Array.from({ length: n }, () => []);
  refs.forEach((ref, r) => {
    const seen = new Set<number>();
    for (const p of ref.pins) {
      if (!seen.has(p.cell)) {
        seen.add(p.cell);
        netsByCell[p.cell].push(r);
      }
    }
  });

  let current = totalHpwl(refs, xs, ys);

  for (let sweep = 0; sweep < sweeps; sweep++) {
    let improved = false;
    for (let i = 0; i < n; i++) {
      const c = cells[i];
      const baseStep = Math.max(1, Math.min(c.width, c.height) / 2);
      const step = Math.max(1, Math.round(baseStep * (1 - sweep / (sweeps + 1))));
      const moves = [
        { dx: step, dy: 0 },
        { dx: -step, dy: 0 },
        { dx: 0, dy: step },
        { dx: 0, dy: -step },
      ];

      for (const move of moves) {
        const nx = Math.min(Math.max(xs[i] + move.dx, 0), Math.max(0, chipWidth - c.width));
        const ny = Math.min(Math.max(ys[i] + move.dy, 0), Math.max(0, chipHeight - c.height));
        if (nx === xs[i] && ny === ys[i]) continue;
        if (overlapsAny(i, nx, ny, cells, xs, ys)) continue;

        let delta = 0;
        for (const r of netsByCell[i]) {
          const before = netHpwlAt(refs[r], xs, ys);
          const after = netHpwlAt(refs[r], xs, ys, { cell: i, x: nx, y: ny });
          delta += after - before;
        }
        if (delta < -EPS) {
          xs[i] = nx;
          ys[i] = ny;
          current += delta;
          improved = true;
        }
      }
    }
    if (!improved) break;
  }

  return current;
}

interface FinalPlacement {
  cells: Cell[];
  wirelength: number;
  overlap: number;
}

/**
 * Legalize a candidate placement with the row-based Abacus legalizer and then
 * polish it with overlap-preserving coordinate descent. Returns the true HPWL
 * and true overlap area of the result.
 */
function legalizeAndPolish(
  xs: number[],
  ys: number[],
  cells: Cell[],
  nets: Net[],
  chipWidth: number,
  chipHeight: number,
  polishSweeps: number
): FinalPlacement {
  const refs = buildNetRefs(cells, nets);
  const withPositions = cells.map((c, i) => ({
    ...c,
    position: { x: xs[i], y: ys[i] },
  }));

  const legalized = abacusLegalization({
    algorithm: PlacementAlgorithm.QUADRATIC,
    chipWidth,
    chipHeight,
    cells: withPositions,
    nets,
  });

  const legalCells = legalized.cells;
  const lx = legalCells.map((c) => c.position?.x ?? 0);
  const ly = legalCells.map((c) => c.position?.y ?? 0);

  polishLegalPositions(refs, legalCells, lx, ly, chipWidth, chipHeight, polishSweeps);

  const placed = legalCells.map((c, i) => ({
    ...c,
    position: { x: lx[i], y: ly[i] },
  }));
  return {
    cells: placed,
    wirelength: totalHpwl(refs, lx, ly),
    overlap: totalOverlapArea(placed),
  };
}

/**
 * Legalizes and polishes the deterministic seeded starting placement. Exported
 * as the public baseline that the solvers must not do worse than.
 */
export function legalizeInitialPlacement(
  cells: Cell[],
  nets: Net[],
  chipWidth: number,
  chipHeight: number,
  seed?: number
): PlacementResult {
  const start = performance.now();
  const effectiveSeed = seed ?? hashPlacementInput(cells, nets, chipWidth, chipHeight);
  const { xs, ys } = initialPositions(cells, chipWidth, chipHeight, effectiveSeed);
  const final = legalizeAndPolish(xs, ys, cells, nets, chipWidth, chipHeight, 40);
  return {
    success: true,
    cells: final.cells,
    totalWirelength: final.wirelength,
    overlap: final.overlap,
    runtime: performance.now() - start,
    iterations: 1,
    convergenceData: [totalHpwl(buildNetRefs(cells, nets), xs, ys), final.wirelength],
  };
}

/* ------------------------------------------------------------------ */
/* runDeepPlace: smooth-HPWL gradient descent with momentum            */
/* ------------------------------------------------------------------ */

export function runDeepPlace(
  cells: Cell[],
  nets: Net[],
  chipWidth: number,
  chipHeight: number,
  options: {
    iterations?: number;
    learningRate?: number;
    batchSize?: number;
    useGPU?: boolean;
    seed?: number;
  } = {}
): PlacementResult {
  const startTime = performance.now();
  const iterations = Math.max(1, Math.floor(options.iterations ?? 1000));
  // Step length as a fraction of the smaller chip dimension. `optimizerRate`
  // is the step controller; `batchSize`/`useGPU` from the historical API are
  // intentionally ignored (no batching, no GPU path exists).
  const optimizerRate = options.learningRate ?? 0.01;

  const working = cells.map((c) => ({ ...c }));
  if (working.length === 0) {
    return {
      success: true,
      cells: [],
      totalWirelength: 0,
      overlap: 0,
      runtime: performance.now() - startTime,
      iterations: 0,
      convergenceData: [],
    };
  }

  const refs = buildNetRefs(working, nets);
  const seed = options.seed ?? hashPlacementInput(working, nets, chipWidth, chipHeight);
  const { xs: initialXs, ys: initialYs } = initialPositions(working, chipWidth, chipHeight, seed);

  const n = working.length;
  const xs = initialXs.slice();
  const ys = initialYs.slice();
  const gx = new Array<number>(n).fill(0);
  const gy = new Array<number>(n).fill(0);
  const vx = new Array<number>(n).fill(0);
  const vy = new Array<number>(n).fill(0);

  const targetDensity = 0.8;
  const extent = Math.max(1, Math.min(chipWidth, chipHeight));
  let step = Math.max(1e-3, optimizerRate * extent);
  const maxStep = Math.max(1, extent / 10);
  const momentum = 0.9;

  let gamma = Math.max(chipWidth, chipHeight, 1) / 5;
  const gammaMin = Math.max(1e-3, Math.max(chipWidth, chipHeight, 1) / 500);
  const gammaDecay = Math.pow(gammaMin / gamma, 1 / iterations);

  const evaluate = (
    tx: number[],
    ty: number[]
  ): { hpwl: number; total: number } => {
    const hpwl = totalHpwl(refs, tx, ty);
    const density = densityPenaltyAndGradient(
      tx,
      ty,
      working,
      chipWidth,
      chipHeight,
      targetDensity,
      [],
      []
    );
    return { hpwl, total: hpwl + density };
  };

  let { total: currentTotal, hpwl: currentHpwl } = evaluate(xs, ys);
  const bestXs = xs.slice();
  const bestYs = ys.slice();
  let bestTotal = currentTotal;
  const convergenceData: number[] = [currentHpwl];

  for (let iter = 0; iter < iterations; iter++) {
    gx.fill(0);
    gy.fill(0);
    addSmoothWireGradients(refs, xs, ys, gamma, gx, gy);
    currentTotal =
      currentHpwl +
      densityPenaltyAndGradient(
        xs,
        ys,
        working,
        chipWidth,
        chipHeight,
        targetDensity,
        gx,
        gy
      );

    for (let i = 0; i < n; i++) {
      vx[i] = momentum * vx[i] - gx[i];
      vy[i] = momentum * vy[i] - gy[i];
    }

    // Backtracking step control: accept the first trial that does not increase
    // the true objective, otherwise halve the step. Momentum is reset when a
    // full backtrack fails so a stale velocity cannot keep pushing.
    let accepted = false;
    for (let attempt = 0; attempt < 8; attempt++) {
      const tx = new Array<number>(n);
      const ty = new Array<number>(n);
      for (let i = 0; i < n; i++) {
        tx[i] = Math.min(
          Math.max(xs[i] + step * vx[i], 0),
          Math.max(0, chipWidth - working[i].width)
        );
        ty[i] = Math.min(
          Math.max(ys[i] + step * vy[i], 0),
          Math.max(0, chipHeight - working[i].height)
        );
      }
      const trial = evaluate(tx, ty);
      if (trial.total <= currentTotal + 1e-9) {
        for (let i = 0; i < n; i++) {
          xs[i] = tx[i];
          ys[i] = ty[i];
        }
        currentTotal = trial.total;
        currentHpwl = trial.hpwl;
        step = Math.min(step * 1.05, maxStep);
        accepted = true;
        if (trial.total < bestTotal) {
          bestTotal = trial.total;
          for (let i = 0; i < n; i++) {
            bestXs[i] = xs[i];
            bestYs[i] = ys[i];
          }
        }
        break;
      }
      step *= 0.5;
      if (step < 1e-6) break;
    }
    if (!accepted) {
      vx.fill(0);
      vy.fill(0);
    }

    convergenceData.push(totalHpwl(refs, bestXs, bestYs));
    gamma = Math.max(gammaMin, gamma * gammaDecay);
  }

  // Compare the optimized placement against the legalized starting placement;
  // return whichever is better after real legalization + polishing.
  const optimized = legalizeAndPolish(
    bestXs,
    bestYs,
    working,
    nets,
    chipWidth,
    chipHeight,
    40
  );
  const baseline = legalizeAndPolish(
    initialXs,
    initialYs,
    working,
    nets,
    chipWidth,
    chipHeight,
    40
  );
  const chosen = optimized.wirelength <= baseline.wirelength ? optimized : baseline;

  return {
    success: true,
    cells: chosen.cells,
    totalWirelength: chosen.wirelength,
    overlap: chosen.overlap,
    runtime: performance.now() - startTime,
    iterations,
    convergenceData,
  };
}

/* ------------------------------------------------------------------ */
/* runGNNPlacement: quadratic clique model solved with CG              */
/* ------------------------------------------------------------------ */

/**
 * Historical name kept for API compatibility. This is a graph/linear-algebra
 * placer (GORDIAN-style quadratic wirelength minimization, conjugate gradient
 * over the cell connectivity graph) — no graph neural network is involved.
 */
export function runGNNPlacement(
  cells: Cell[],
  nets: Net[],
  chipWidth: number,
  chipHeight: number,
  options: {
    gnnLayers?: number;
    embeddingDim?: number;
    iterations?: number;
    seed?: number;
  } = {}
): PlacementResult {
  const startTime = performance.now();
  // `gnnLayers`/`embeddingDim` are accepted for API compatibility only: the
  // quadratic model has no layers or embeddings. `iterations` scales the
  // post-legalization polish budget.
  const polishSweeps = Math.max(10, Math.min(60, Math.floor(options.iterations ?? 500)));
  const working = cells.map((c) => ({ ...c }));

  if (working.length === 0) {
    return {
      success: true,
      cells: [],
      totalWirelength: 0,
      overlap: 0,
      runtime: performance.now() - startTime,
      iterations: 0,
      convergenceData: [],
    };
  }

  // 1. Solve the quadratic (clique) wirelength model: a real sparse linear
  //    system over the connectivity graph, solved by preconditioned CG.
  const solved = quadraticPlacement({
    algorithm: PlacementAlgorithm.QUADRATIC,
    chipWidth,
    chipHeight,
    cells: working,
    nets,
  });

  const seed = options.seed ?? hashPlacementInput(working, nets, chipWidth, chipHeight);
  const { xs: initialXs, ys: initialYs } = initialPositions(working, chipWidth, chipHeight, seed);

  const solvedXs = solved.cells.map((c) => c.position?.x ?? 0);
  const solvedYs = solved.cells.map((c) => c.position?.y ?? 0);

  const final = legalizeAndPolish(
    solvedXs,
    solvedYs,
    solved.cells,
    nets,
    chipWidth,
    chipHeight,
    polishSweeps
  );
  const baseline = legalizeAndPolish(initialXs, initialYs, working, nets, chipWidth, chipHeight, polishSweeps);
  const chosen = final.wirelength <= baseline.wirelength ? final : baseline;

  return {
    success: true,
    cells: chosen.cells,
    totalWirelength: chosen.wirelength,
    overlap: chosen.overlap,
    runtime: performance.now() - startTime,
    iterations: 1,
    convergenceData: [
      totalHpwl(buildNetRefs(working, nets), solvedXs, solvedYs),
      chosen.wirelength,
    ],
  };
}

/* ------------------------------------------------------------------ */
/* runRLEnhancedPlacement: deterministic local search                  */
/* ------------------------------------------------------------------ */

/**
 * Historical name kept for API compatibility. The previous implementation
 * claimed PPO/foundation-model guidance while sampling from an untrained
 * table. This is now an honest deterministic local search: coordinate descent
 * plus pairwise swaps on the weighted-HPWL objective, followed by
 * legalization. There is no policy, value function, reward model or learning.
 * The `gamma`/`epsilon`/`usePretrained` options are accepted but ignored.
 */
export function runRLEnhancedPlacement(
  cells: Cell[],
  nets: Net[],
  chipWidth: number,
  chipHeight: number,
  options: {
    episodes?: number;
    gamma?: number;
    epsilon?: number;
    usePretrained?: boolean;
    seed?: number;
  } = {}
): PlacementResult {
  const startTime = performance.now();
  const sweeps = Math.max(1, Math.floor(options.episodes ?? 100));
  const working = cells.map((c) => ({ ...c }));
  const n = working.length;

  if (n === 0) {
    return {
      success: true,
      cells: [],
      totalWirelength: 0,
      overlap: 0,
      runtime: performance.now() - startTime,
      iterations: 0,
      convergenceData: [],
    };
  }

  const refs = buildNetRefs(working, nets);
  const seed = options.seed ?? hashPlacementInput(working, nets, chipWidth, chipHeight);
  const { xs: initialXs, ys: initialYs } = initialPositions(working, chipWidth, chipHeight, seed);
  const xs = initialXs.slice();
  const ys = initialYs.slice();

  let current = totalHpwl(refs, xs, ys);
  const bestXs = xs.slice();
  const bestYs = ys.slice();
  let best = current;
  const convergenceData: number[] = [current];

  for (let sweep = 0; sweep < sweeps; sweep++) {
    let improved = false;
    const step = Math.max(1, Math.round(Math.min(chipWidth, chipHeight) * 0.05 * (1 - sweep / (sweeps + 1))));

    // Coordinate descent.
    for (let i = 0; i < n; i++) {
      const c = working[i];
      const moves = [
        { x: xs[i] + step, y: ys[i] },
        { x: xs[i] - step, y: ys[i] },
        { x: xs[i], y: ys[i] + step },
        { x: xs[i], y: ys[i] - step },
      ];
      for (const m of moves) {
        const nx = Math.min(Math.max(m.x, 0), Math.max(0, chipWidth - c.width));
        const ny = Math.min(Math.max(m.y, 0), Math.max(0, chipHeight - c.height));
        const delta = candidateDelta(refs, xs, ys, i, nx, ny);
        if (delta < -EPS) {
          xs[i] = nx;
          ys[i] = ny;
          current += delta;
          improved = true;
        }
      }
    }

    // Pairwise swaps (capped so large designs stay fast; the swap pass is a
    // bonus, the coordinate pass is the guaranteed improvement channel).
    if (n <= 250 && sweep % 2 === 0) {
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const delta =
            candidateDelta(refs, xs, ys, j, xs[i], ys[i]) +
            candidateDelta(refs, xs, ys, i, xs[j], ys[j]);
          if (delta < -EPS) {
            const tx = xs[i];
            const ty = ys[i];
            xs[i] = xs[j];
            ys[i] = ys[j];
            xs[j] = tx;
            ys[j] = ty;
            current += delta;
            improved = true;
          }
        }
      }
    }

    if (current < best) {
      best = current;
      for (let i = 0; i < n; i++) {
        bestXs[i] = xs[i];
        bestYs[i] = ys[i];
      }
    }
    convergenceData.push(best);
    if (!improved) break;
  }

  const optimized = legalizeAndPolish(bestXs, bestYs, working, nets, chipWidth, chipHeight, 40);
  const baseline = legalizeAndPolish(initialXs, initialYs, working, nets, chipWidth, chipHeight, 40);
  const chosen = optimized.wirelength <= baseline.wirelength ? optimized : baseline;

  return {
    success: true,
    cells: chosen.cells,
    totalWirelength: chosen.wirelength,
    overlap: chosen.overlap,
    runtime: performance.now() - startTime,
    iterations: sweeps,
    convergenceData,
  };
}

/** HPWL change from moving cell `i` to (nx, ny). */
function candidateDelta(
  refs: NetRef[],
  xs: number[],
  ys: number[],
  i: number,
  nx: number,
  ny: number
): number {
  if (nx === xs[i] && ny === ys[i]) return 0;
  let delta = 0;
  for (const ref of refs) {
    let touches = false;
    for (const p of ref.pins) {
      if (p.cell === i) {
        touches = true;
        break;
      }
    }
    if (!touches) continue;
    delta +=
      netHpwlAt(ref, xs, ys, { cell: i, x: nx, y: ny }) - netHpwlAt(ref, xs, ys);
  }
  return delta;
}

/* ------------------------------------------------------------------ */
/* runTransformerPlacement: connectivity-weighted smoothing            */
/* ------------------------------------------------------------------ */

/**
 * Historical name kept for API compatibility. This is a softmax-weighted
 * averaging heuristic over each net's cells (an attention-shaped diffusion of
 * positions), followed by legalization. It is not a transformer and has no
 * trained parameters. `numHeads` is accepted but unused; `numLayers` controls
 * how many smoothing passes run per outer iteration.
 */
export function runTransformerPlacement(
  cells: Cell[],
  nets: Net[],
  chipWidth: number,
  chipHeight: number,
  options: {
    numHeads?: number;
    numLayers?: number;
    iterations?: number;
    seed?: number;
  } = {}
): PlacementResult {
  const startTime = performance.now();
  const outerIterations = Math.max(1, Math.floor(options.iterations ?? 300));
  const passesPerIteration = Math.max(1, Math.min(8, Math.floor(options.numLayers ?? 6)));
  const working = cells.map((c) => ({ ...c }));
  const n = working.length;

  if (n === 0) {
    return {
      success: true,
      cells: [],
      totalWirelength: 0,
      overlap: 0,
      runtime: performance.now() - startTime,
      iterations: 0,
      convergenceData: [],
    };
  }

  const refs = buildNetRefs(working, nets);
  const seed = options.seed ?? hashPlacementInput(working, nets, chipWidth, chipHeight);
  const { xs: initialXs, ys: initialYs } = initialPositions(working, chipWidth, chipHeight, seed);
  const xs = initialXs.slice();
  const ys = initialYs.slice();

  const sigma0 = Math.max(chipWidth, chipHeight, 1) / 2;
  const sigmaMin = Math.max(1, Math.min(chipWidth, chipHeight) / 50);
  const sigmaDecay = Math.pow(sigmaMin / sigma0, 1 / outerIterations);

  // Unique pin positions per net are enough for a centroid pull.
  const netsByCell: number[][] = Array.from({ length: n }, () => []);
  refs.forEach((ref, r) => {
    const seen = new Set<number>();
    for (const p of ref.pins) {
      if (!seen.has(p.cell)) {
        seen.add(p.cell);
        netsByCell[p.cell].push(r);
      }
    }
  });

  let sigma = sigma0;
  const convergenceData: number[] = [totalHpwl(refs, xs, ys)];

  for (let iter = 0; iter < outerIterations; iter++) {
    for (let pass = 0; pass < passesPerIteration; pass++) {
      const targetX = new Array<number>(n).fill(0);
      const targetY = new Array<number>(n).fill(0);
      const weightSum = new Array<number>(n).fill(0);
      const twoSigmaSq = 2 * sigma * sigma;

      for (const ref of refs) {
        const members = new Set<number>();
        for (const p of ref.pins) members.add(p.cell);
        for (const i of members) {
          const ci = working[i];
          const cix = xs[i] + ci.width / 2;
          const ciy = ys[i] + ci.height / 2;
          for (const j of members) {
            if (i === j) continue;
            const cj = working[j];
            const cjx = xs[j] + cj.width / 2;
            const cjy = ys[j] + cj.height / 2;
            const d2 = (cjx - cix) ** 2 + (cjy - ciy) ** 2;
            const w = Math.exp(-d2 / twoSigmaSq) + 1e-6;
            targetX[i] += w * cjx;
            targetY[i] += w * cjy;
            weightSum[i] += w;
          }
        }
      }

      const blend = 0.5;
      for (let i = 0; i < n; i++) {
        if (weightSum[i] <= 0) continue;
        const tx = targetX[i] / weightSum[i];
        const ty = targetY[i] / weightSum[i];
        const cx = xs[i] + working[i].width / 2;
        const cy = ys[i] + working[i].height / 2;
        xs[i] = Math.min(
          Math.max(xs[i] + blend * (tx - cx), 0),
          Math.max(0, chipWidth - working[i].width)
        );
        ys[i] = Math.min(
          Math.max(ys[i] + blend * (ty - cy), 0),
          Math.max(0, chipHeight - working[i].height)
        );
      }
    }

    convergenceData.push(totalHpwl(refs, xs, ys));
    sigma = Math.max(sigmaMin, sigma * sigmaDecay);
  }

  const smoothed = legalizeAndPolish(xs, ys, working, nets, chipWidth, chipHeight, 40);
  const baseline = legalizeAndPolish(initialXs, initialYs, working, nets, chipWidth, chipHeight, 40);
  const chosen = smoothed.wirelength <= baseline.wirelength ? smoothed : baseline;

  return {
    success: true,
    cells: chosen.cells,
    totalWirelength: chosen.wirelength,
    overlap: chosen.overlap,
    runtime: performance.now() - startTime,
    iterations: outerIterations,
    convergenceData,
  };
}
