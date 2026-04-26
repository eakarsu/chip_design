/**
 * Rectilinear layer boolean operations.
 *
 * Operates on lists of axis-aligned rectangles, useful for layer
 * derivations like NWELL = NWELL_DRAWN + NWELL_DERIVED, or PSEUDO_VIA =
 * VIA AND CUT_REQUIRED.
 *
 * Implementation strategy: rasterise both inputs to a shared grid whose
 * x/y edges are the union of all rectangle edges (a sweepline-grid),
 * then the boolean is a per-cell bit operation. Output runs are merged
 * into rectangles row-by-row, then column-merged for compactness.
 *
 * This is exact for axis-aligned input geometry, runs in O(N · M) cells
 * where N = unique x-edges, M = unique y-edges, and is typically more
 * than fast enough for the small layer-derivation sets the UI handles.
 *
 * Also supports SIZE (oversize / undersize by `delta`), which produces
 * each rectangle inflated (or shrunken) by `delta` on every side and
 * then ORed together to remove overlaps.
 */

export interface Rect {
  x1: number; y1: number; x2: number; y2: number;
}

export type BoolOp = 'and' | 'or' | 'xor' | 'not';

function uniqueSorted(values: number[]): number[] {
  const out = [...new Set(values)].sort((a, b) => a - b);
  return out;
}

/** Rasterise a rect set onto a shared (xs, ys) grid. */
function rasterise(rects: Rect[], xs: number[], ys: number[]): Uint8Array {
  const cellsX = xs.length - 1;
  const cellsY = ys.length - 1;
  const buf = new Uint8Array(cellsX * cellsY);
  if (cellsX <= 0 || cellsY <= 0) return buf;
  // For each rect, find its [ix0..ix1) [iy0..iy1) cell range.
  for (const r of rects) {
    let ix0 = lowerBound(xs, r.x1);
    let ix1 = lowerBound(xs, r.x2);
    let iy0 = lowerBound(ys, r.y1);
    let iy1 = lowerBound(ys, r.y2);
    if (ix1 <= ix0 || iy1 <= iy0) continue;
    if (ix0 < 0) ix0 = 0;
    if (iy0 < 0) iy0 = 0;
    if (ix1 > cellsX) ix1 = cellsX;
    if (iy1 > cellsY) iy1 = cellsY;
    for (let iy = iy0; iy < iy1; iy++) {
      const row = iy * cellsX;
      for (let ix = ix0; ix < ix1; ix++) {
        buf[row + ix] = 1;
      }
    }
  }
  return buf;
}

function lowerBound(arr: number[], v: number): number {
  let lo = 0, hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (arr[mid] < v) lo = mid + 1; else hi = mid;
  }
  return lo;
}

/** Convert a bitmap on grid (xs, ys) back to rectangles. */
function devectorise(
  buf: Uint8Array,
  xs: number[],
  ys: number[],
): Rect[] {
  const cellsX = xs.length - 1;
  const cellsY = ys.length - 1;
  // 1. Per-row run extraction.
  const rowRects: { y1: number; y2: number; x1: number; x2: number }[] = [];
  for (let iy = 0; iy < cellsY; iy++) {
    let ix = 0;
    while (ix < cellsX) {
      while (ix < cellsX && !buf[iy * cellsX + ix]) ix++;
      if (ix >= cellsX) break;
      const start = ix;
      while (ix < cellsX && buf[iy * cellsX + ix]) ix++;
      rowRects.push({
        y1: ys[iy], y2: ys[iy + 1],
        x1: xs[start], x2: xs[ix],
      });
    }
  }
  // 2. Vertical merge: combine identical horizontal extents in adjacent rows.
  rowRects.sort((a, b) =>
    a.x1 - b.x1 || a.x2 - b.x2 || a.y1 - b.y1,
  );
  const merged: Rect[] = [];
  for (const r of rowRects) {
    const last = merged[merged.length - 1];
    if (last && last.x1 === r.x1 && last.x2 === r.x2 && last.y2 === r.y1) {
      last.y2 = r.y2;
    } else {
      merged.push({ ...r });
    }
  }
  return merged;
}

/** Apply a boolean op between two rect sets. NOT is `a - b`. */
export function layerBool(a: Rect[], b: Rect[], op: BoolOp): Rect[] {
  const xs = uniqueSorted([
    ...a.flatMap(r => [r.x1, r.x2]),
    ...b.flatMap(r => [r.x1, r.x2]),
  ]);
  const ys = uniqueSorted([
    ...a.flatMap(r => [r.y1, r.y2]),
    ...b.flatMap(r => [r.y1, r.y2]),
  ]);
  if (xs.length < 2 || ys.length < 2) return [];

  const ba = rasterise(a, xs, ys);
  const bb = rasterise(b, xs, ys);
  const out = new Uint8Array(ba.length);
  switch (op) {
    case 'and': for (let i = 0; i < out.length; i++) out[i] = ba[i] & bb[i]; break;
    case 'or':  for (let i = 0; i < out.length; i++) out[i] = ba[i] | bb[i]; break;
    case 'xor': for (let i = 0; i < out.length; i++) out[i] = ba[i] ^ bb[i]; break;
    case 'not': for (let i = 0; i < out.length; i++) out[i] = ba[i] & ~bb[i]; break;
  }
  return devectorise(out, xs, ys);
}

/**
 * Inflate (positive delta) or shrink (negative delta) every rectangle on
 * each side by `delta`, then OR them together to merge the result.
 *
 * For shrink, rects whose width or height become non-positive are
 * dropped — this matches the standard "undersize" behaviour where small
 * shapes vanish.
 */
export function layerSize(rects: Rect[], delta: number): Rect[] {
  if (delta === 0) return layerBool(rects, [], 'or');
  const sized: Rect[] = [];
  for (const r of rects) {
    const x1 = r.x1 - delta;
    const x2 = r.x2 + delta;
    const y1 = r.y1 - delta;
    const y2 = r.y2 + delta;
    if (x2 <= x1 || y2 <= y1) continue;
    sized.push({ x1, y1, x2, y2 });
  }
  return layerBool(sized, [], 'or');
}

/** Total area covered by the rect set (assuming no overlaps). */
export function totalArea(rects: Rect[]): number {
  let a = 0;
  for (const r of rects) a += Math.max(0, r.x2 - r.x1) * Math.max(0, r.y2 - r.y1);
  return a;
}
