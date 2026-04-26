/**
 * Density-fill inserter.
 *
 * Insert dummy-fill rectangles into low-density windows on a metal layer
 * so the design hits a target density without violating min-spacing.
 *
 * Algorithm (deliberately small and deterministic):
 *
 *   1. Compute the existing density per coarse bin across the window.
 *   2. For each bin below `targetDensity`, lay a regular grid of fill
 *      candidates with cell size `cellW × cellH` and pitch `pitch`.
 *   3. Reject any candidate that comes within `minSpacing` of an existing
 *      rectangle or a previously-accepted fill rectangle.
 *   4. Stop once the bin reaches the target (or the grid is exhausted).
 *
 * Inputs and outputs are in arbitrary linear units (μm by convention).
 */

export interface FillRect {
  x1: number; y1: number; x2: number; y2: number;
  /** True if this is an inserted fill rect; false if an existing obstruction. */
  fill?: boolean;
}

export interface FillSpec {
  /** Window in which to insert fill. */
  window: { x1: number; y1: number; x2: number; y2: number };
  /** Existing rectangles on the same metal layer (obstructions). */
  obstacles: FillRect[];
  /** Density goal as a fraction (0..1). Default 0.4. */
  targetDensity?: number;
  /** Side length of each square fill cell (μm). Default 1. */
  cellW?: number;
  cellH?: number;
  /** Center-to-center pitch between fill cells (μm). Must be ≥ cell + minSpacing. */
  pitch?: number;
  /** Minimum spacing between any two rectangles (existing or fill). Default 0.1. */
  minSpacing?: number;
  /** Number of coarse density bins per axis. Default 8. */
  bins?: number;
}

export interface FillReport {
  fills: FillRect[];
  /** Density per bin BEFORE fill, density[y][x] (0..1). */
  before: number[][];
  /** Density per bin AFTER fill, density[y][x] (0..1). */
  after: number[][];
  binsX: number;
  binsY: number;
  binW: number;
  binH: number;
  /** Total inserted fill area (μm²). */
  filledArea: number;
  /** Existing obstruction area inside the window (μm²). */
  existingArea: number;
  /** Final mean density across the window. */
  meanAfter: number;
  /** Bins that didn't reach target — useful for warnings. */
  underfilled: { bx: number; by: number; density: number }[];
}

function rectArea(r: FillRect): number {
  return Math.max(0, r.x2 - r.x1) * Math.max(0, r.y2 - r.y1);
}
function intersectArea(a: FillRect, b: FillRect): number {
  const x1 = Math.max(a.x1, b.x1);
  const x2 = Math.min(a.x2, b.x2);
  const y1 = Math.max(a.y1, b.y1);
  const y2 = Math.min(a.y2, b.y2);
  if (x2 <= x1 || y2 <= y1) return 0;
  return (x2 - x1) * (y2 - y1);
}
/** True if the inflated rect a (by `pad` on all sides) overlaps b. */
function tooClose(a: FillRect, b: FillRect, pad: number): boolean {
  return !(
    a.x2 + pad <= b.x1 ||
    b.x2 + pad <= a.x1 ||
    a.y2 + pad <= b.y1 ||
    b.y2 + pad <= a.y1
  );
}

/** Compute density grid for `rects` inside `window`. */
export function computeDensityGrid(
  window: FillSpec['window'],
  rects: FillRect[],
  binsX: number,
  binsY: number,
): { density: number[][]; binW: number; binH: number } {
  const W = window.x2 - window.x1;
  const H = window.y2 - window.y1;
  const binW = W / binsX;
  const binH = H / binsY;
  const density: number[][] = Array.from({ length: binsY }, () =>
    new Array(binsX).fill(0),
  );
  const cellArea = binW * binH;
  for (const r of rects) {
    // Iterate the bins this rect could overlap — bbox-clip first.
    const bx0 = Math.max(0, Math.floor((Math.max(r.x1, window.x1) - window.x1) / binW));
    const bx1 = Math.min(binsX - 1, Math.floor((Math.min(r.x2, window.x2) - window.x1 - 1e-12) / binW));
    const by0 = Math.max(0, Math.floor((Math.max(r.y1, window.y1) - window.y1) / binH));
    const by1 = Math.min(binsY - 1, Math.floor((Math.min(r.y2, window.y2) - window.y1 - 1e-12) / binH));
    for (let by = by0; by <= by1; by++) {
      for (let bx = bx0; bx <= bx1; bx++) {
        const cell = {
          x1: window.x1 + bx * binW,
          y1: window.y1 + by * binH,
          x2: window.x1 + (bx + 1) * binW,
          y2: window.y1 + (by + 1) * binH,
        };
        density[by][bx] += intersectArea(cell, r) / cellArea;
      }
    }
  }
  return { density, binW, binH };
}

export function insertFill(spec: FillSpec): FillReport {
  const target = spec.targetDensity ?? 0.4;
  const cellW = spec.cellW ?? 1;
  const cellH = spec.cellH ?? cellW;
  const minSpacing = spec.minSpacing ?? 0.1;
  const pitch = spec.pitch ?? Math.max(cellW, cellH) + minSpacing;
  const binsX = Math.max(1, spec.bins ?? 8);

  const W = spec.window.x2 - spec.window.x1;
  const H = spec.window.y2 - spec.window.y1;
  if (W <= 0 || H <= 0) throw new Error('window must have positive area');
  const binsY = Math.max(1, Math.round(binsX * H / W));

  const before = computeDensityGrid(spec.window, spec.obstacles, binsX, binsY);
  const binW = before.binW;
  const binH = before.binH;
  const cellArea = binW * binH;

  // Spatial index per bin so neighbour checks stay local.
  const grid: FillRect[][][] = Array.from({ length: binsY }, () =>
    Array.from({ length: binsX }, () => [] as FillRect[]),
  );
  function indexInto(r: FillRect) {
    const bx0 = Math.max(0, Math.floor((r.x1 - spec.window.x1) / binW));
    const bx1 = Math.min(binsX - 1, Math.floor((r.x2 - spec.window.x1 - 1e-12) / binW));
    const by0 = Math.max(0, Math.floor((r.y1 - spec.window.y1) / binH));
    const by1 = Math.min(binsY - 1, Math.floor((r.y2 - spec.window.y1 - 1e-12) / binH));
    for (let by = by0; by <= by1; by++)
      for (let bx = bx0; bx <= bx1; bx++)
        grid[by][bx].push(r);
  }
  for (const o of spec.obstacles) indexInto(o);

  function neighborsAround(r: FillRect): FillRect[] {
    const bx0 = Math.max(0, Math.floor((r.x1 - minSpacing - spec.window.x1) / binW));
    const bx1 = Math.min(binsX - 1, Math.floor((r.x2 + minSpacing - spec.window.x1) / binW));
    const by0 = Math.max(0, Math.floor((r.y1 - minSpacing - spec.window.y1) / binH));
    const by1 = Math.min(binsY - 1, Math.floor((r.y2 + minSpacing - spec.window.y1) / binH));
    const seen = new Set<FillRect>();
    for (let by = by0; by <= by1; by++)
      for (let bx = bx0; bx <= bx1; bx++)
        for (const r of grid[by][bx]) seen.add(r);
    return [...seen];
  }

  const fills: FillRect[] = [];
  const density = before.density.map(row => [...row]);

  for (let by = 0; by < binsY; by++) {
    for (let bx = 0; bx < binsX; bx++) {
      if (density[by][bx] >= target) continue;
      const x0 = spec.window.x1 + bx * binW;
      const y0 = spec.window.y1 + by * binH;
      const x1 = x0 + binW;
      const y1 = y0 + binH;
      // Lay a grid of candidates inside this bin.
      for (let cy = y0 + minSpacing; cy + cellH <= y1 - minSpacing + 1e-9; cy += pitch) {
        for (let cx = x0 + minSpacing; cx + cellW <= x1 - minSpacing + 1e-9; cx += pitch) {
          if (density[by][bx] >= target) break;
          const cand: FillRect = { x1: cx, y1: cy, x2: cx + cellW, y2: cy + cellH, fill: true };
          let bad = false;
          for (const n of neighborsAround(cand)) {
            if (tooClose(cand, n, minSpacing)) { bad = true; break; }
          }
          if (bad) continue;
          fills.push(cand);
          indexInto(cand);
          density[by][bx] += rectArea(cand) / cellArea;
        }
      }
    }
  }

  const after = computeDensityGrid(
    spec.window,
    [...spec.obstacles, ...fills],
    binsX, binsY,
  ).density;

  const filledArea = fills.reduce((a, r) => a + rectArea(r), 0);
  const existingArea = spec.obstacles.reduce(
    (a, r) => a + intersectArea(r, { ...spec.window } as FillRect),
    0,
  );
  let sumAfter = 0;
  for (const row of after) for (const v of row) sumAfter += v;
  const meanAfter = sumAfter / (binsX * binsY);

  const underfilled: FillReport['underfilled'] = [];
  for (let by = 0; by < binsY; by++) {
    for (let bx = 0; bx < binsX; bx++) {
      if (after[by][bx] < target - 1e-6) {
        underfilled.push({ bx, by, density: after[by][bx] });
      }
    }
  }

  return {
    fills,
    before: before.density,
    after,
    binsX, binsY, binW, binH,
    filledArea, existingArea,
    meanAfter,
    underfilled,
  };
}
