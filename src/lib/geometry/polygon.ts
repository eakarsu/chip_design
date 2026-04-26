/**
 * Polygon boolean engine — rectilinear (Manhattan) set operations.
 *
 * IC layout shapes are overwhelmingly axis-aligned: GDSII BOUNDARY records,
 * routed wires (after orthogonalization), DRC marker rectangles, etc. This
 * module implements AND / OR / XOR / NOT / SIZE on rectilinear polygons via
 * a y-band scanline:
 *
 *   1. Decompose every polygon into a sorted set of horizontal slab rects.
 *   2. For a given y-band, both inputs reduce to disjoint x-intervals.
 *   3. Apply the chosen op to the intervals.
 *   4. Merge vertically-adjacent output rects with identical x-intervals.
 *
 * The result is itself a canonical, non-overlapping rectangle set. That's
 * what DRC, density extraction, and the layout viewer all want — no need
 * for a polygon contour trace until you're writing GDSII back out.
 *
 * For non-Manhattan input (45° / arbitrary edges) we conservatively fall
 * back to the bounding box of each polygon. The op is still correct as a
 * superset; callers needing exact 45° geometry should rasterize first.
 */

export interface Pt {
  x: number;
  y: number;
}

export type Polygon = Pt[];     // closed, no repeated first/last vertex
export type PolygonSet = Polygon[];

export interface Rect {
  xl: number;
  yl: number;
  xh: number;
  yh: number;
}

export type BoolOp = 'AND' | 'OR' | 'XOR' | 'NOT';

// --- public API -------------------------------------------------------------

/**
 * Apply a boolean op to two rectangle sets.
 *
 * Inputs may overlap arbitrarily; the result is canonicalized (disjoint,
 * merged where adjacent rectangles share a full horizontal edge).
 */
export function boolRects(a: Rect[], b: Rect[], op: BoolOp): Rect[] {
  if (a.length === 0 && b.length === 0) return [];
  // No shortcuts for single-empty inputs — the scanline normalizes them
  // (which is what `canonicalize` exploits via boolRects(rects, [], 'OR')).

  const ys = sortedUnique([...a, ...b].flatMap(r => [r.yl, r.yh]));
  const out: Rect[] = [];

  for (let i = 0; i + 1 < ys.length; i++) {
    const y0 = ys[i];
    const y1 = ys[i + 1];
    if (y0 === y1) continue;

    const aInts = bandIntervals(a, y0, y1);
    const bInts = bandIntervals(b, y0, y1);
    const merged = intervalOp(aInts, bInts, op);

    for (const [xl, xh] of merged) {
      pushBand(out, xl, xh, y0, y1);
    }
  }
  return out;
}

/**
 * Minkowski offset by `delta` units (positive grows, negative shrinks).
 *
 * Implementation: each rect is expanded by ±delta on every side, the
 * resulting rectangles are then OR'd together to coalesce overlap. For
 * negative delta, rectangles that would invert are dropped — this matches
 * the EDA convention where SIZE -d removes shapes narrower than 2d.
 */
export function sizeRects(rects: Rect[], delta: number): Rect[] {
  if (delta === 0) return canonicalize(rects);
  const grown: Rect[] = [];
  for (const r of rects) {
    const g: Rect = {
      xl: r.xl - delta,
      yl: r.yl - delta,
      xh: r.xh + delta,
      yh: r.yh + delta,
    };
    if (g.xh > g.xl && g.yh > g.yl) grown.push(g);
  }
  return boolRects(grown, [], 'OR');
}

/** Convenience: union (OR) — useful as the canonical normalizer. */
export function unionRects(rects: Rect[]): Rect[] {
  return boolRects(rects, [], 'OR');
}

/** Total area of a (possibly overlapping) rectangle set. Caller may want
 *  to canonicalize first to avoid double-counting. */
export function rectsArea(rects: Rect[]): number {
  let a = 0;
  for (const r of rects) a += (r.xh - r.xl) * (r.yh - r.yl);
  return a;
}

/** Bounding box of a rectangle set, or null if empty. */
export function rectsBbox(rects: Rect[]): Rect | null {
  if (rects.length === 0) return null;
  let xl = Infinity, yl = Infinity, xh = -Infinity, yh = -Infinity;
  for (const r of rects) {
    if (r.xl < xl) xl = r.xl;
    if (r.yl < yl) yl = r.yl;
    if (r.xh > xh) xh = r.xh;
    if (r.yh > yh) yh = r.yh;
  }
  return { xl, yl, xh, yh };
}

/**
 * Convert a rectilinear polygon to a canonical rectangle decomposition.
 *
 * Polygons with diagonal edges are detected; those polygons return their
 * bounding box (a documented over-approximation).
 */
export function polygonToRects(p: Polygon): Rect[] {
  if (p.length < 3) return [];
  if (!isRectilinear(p)) {
    const bb = polygonBbox(p);
    return bb ? [bb] : [];
  }
  if (p.length < 4) return [];
  const ys = sortedUnique(p.map(pt => pt.y));
  const out: Rect[] = [];
  for (let i = 0; i + 1 < ys.length; i++) {
    const y0 = ys[i];
    const y1 = ys[i + 1];
    const ints = polygonBandIntervals(p, y0, y1);
    for (const [xl, xh] of ints) out.push({ xl, yl: y0, xh, yh: y1 });
  }
  return out;
}

export function polygonsToRects(polys: PolygonSet): Rect[] {
  return polys.flatMap(polygonToRects);
}

/**
 * Trace canonicalized rectangles back into closed rectilinear polygons.
 *
 * Algorithm: build the multiset of directed edges (each rect contributes
 * 4 edges in CCW order around its interior). Edges shared between two
 * adjacent rectangles appear twice with opposite direction and cancel.
 * What remains is the boundary; walk it to form loops.
 *
 * Robust to T-junctions because we split horizontal/vertical edges at
 * every breakpoint before pairing.
 */
export function tracePolygons(rects: Rect[]): PolygonSet {
  if (rects.length === 0) return [];
  const norm = canonicalize(rects);

  // Bucket horizontal edges by y, vertical by x. Each entry is
  // [a, b, dir] where dir is +1 (forward) or -1 (reverse).
  const hByY = new Map<number, [number, number, number][]>();
  const vByX = new Map<number, [number, number, number][]>();
  const pushH = (y: number, a: number, b: number, dir: number) => {
    const arr = hByY.get(y) ?? [];
    arr.push([a, b, dir]);
    hByY.set(y, arr);
  };
  const pushV = (x: number, a: number, b: number, dir: number) => {
    const arr = vByX.get(x) ?? [];
    arr.push([a, b, dir]);
    vByX.set(x, arr);
  };
  for (const r of norm) {
    // CCW around interior: bottom →, right ↑, top ←, left ↓
    pushH(r.yl, r.xl, r.xh, +1);
    pushV(r.xh, r.yl, r.yh, +1);
    pushH(r.yh, r.xh, r.xl, -1);
    pushV(r.xl, r.yh, r.yl, -1);
  }

  // Per coordinate, split at all breakpoints and net the directions.
  // Per coordinate, split each stored segment at every breakpoint and net
  // the direction signs. `d` already encodes direction (+1 = increasing,
  // −1 = decreasing) — interior shared edges contribute +1 and −1 over the
  // same sub-interval and cancel.
  const surviving: { from: Pt; to: Pt }[] = [];
  for (const [y, segs] of hByY) {
    const xs = sortedUnique(segs.flatMap(s => [s[0], s[1]]));
    for (let i = 0; i + 1 < xs.length; i++) {
      const a = xs[i], b = xs[i + 1];
      let dir = 0;
      for (const [s, e, d] of segs) {
        const lo = Math.min(s, e), hi = Math.max(s, e);
        if (lo <= a && b <= hi) dir += d;
      }
      if (dir > 0) surviving.push({ from: { x: a, y }, to: { x: b, y } });
      else if (dir < 0) surviving.push({ from: { x: b, y }, to: { x: a, y } });
    }
  }
  for (const [x, segs] of vByX) {
    const ys = sortedUnique(segs.flatMap(s => [s[0], s[1]]));
    for (let i = 0; i + 1 < ys.length; i++) {
      const a = ys[i], b = ys[i + 1];
      let dir = 0;
      for (const [s, e, d] of segs) {
        const lo = Math.min(s, e), hi = Math.max(s, e);
        if (lo <= a && b <= hi) dir += d;
      }
      if (dir > 0) surviving.push({ from: { x, y: a }, to: { x, y: b } });
      else if (dir < 0) surviving.push({ from: { x, y: b }, to: { x, y: a } });
    }
  }

  // Walk: index edges by `from` point and follow.
  const key = (p: Pt) => `${p.x}|${p.y}`;
  const adj = new Map<string, { from: Pt; to: Pt }[]>();
  for (const e of surviving) {
    const k = key(e.from);
    const arr = adj.get(k) ?? [];
    arr.push(e);
    adj.set(k, arr);
  }
  const polys: PolygonSet = [];
  while (adj.size > 0) {
    const startKey = adj.keys().next().value as string;
    const startList = adj.get(startKey)!;
    let edge = startList.shift()!;
    if (startList.length === 0) adj.delete(startKey);
    const start = edge.from;
    const loop: Polygon = [start];
    while (true) {
      const next = edge.to;
      if (next.x === start.x && next.y === start.y) break;
      loop.push(next);
      const k = key(next);
      const list = adj.get(k);
      if (!list || list.length === 0) break;
      edge = list.shift()!;
      if (list.length === 0) adj.delete(k);
    }
    if (loop.length >= 4) polys.push(loop);
  }
  return polys;
}

// --- internals --------------------------------------------------------------

function sortedUnique(xs: number[]): number[] {
  const s = Array.from(new Set(xs));
  s.sort((a, b) => a - b);
  return s;
}

function isRectilinear(p: Polygon): boolean {
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length];
    if (a.x !== b.x && a.y !== b.y) return false;
  }
  return true;
}

function polygonBbox(p: Polygon): Rect | null {
  if (p.length === 0) return null;
  let xl = Infinity, yl = Infinity, xh = -Infinity, yh = -Infinity;
  for (const pt of p) {
    if (pt.x < xl) xl = pt.x;
    if (pt.y < yl) yl = pt.y;
    if (pt.x > xh) xh = pt.x;
    if (pt.y > yh) yh = pt.y;
  }
  return { xl, yl, xh, yh };
}

/**
 * Even-odd fill: vertical edges of the polygon strictly spanning [y0,y1)
 * partition the band into in/out intervals. Sort their x-coords, pair up.
 */
function polygonBandIntervals(p: Polygon, y0: number, y1: number): [number, number][] {
  const yMid = (y0 + y1) / 2;
  const xs: number[] = [];
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length];
    if (a.x !== b.x) continue;
    const ymin = Math.min(a.y, b.y), ymax = Math.max(a.y, b.y);
    if (ymin < yMid && yMid < ymax) xs.push(a.x);
  }
  xs.sort((a, b) => a - b);
  const out: [number, number][] = [];
  for (let i = 0; i + 1 < xs.length; i += 2) {
    if (xs[i] !== xs[i + 1]) out.push([xs[i], xs[i + 1]]);
  }
  return out;
}

/**
 * Disjoint, sorted x-intervals occupied by `rects` strictly within band [y0,y1).
 * "Strictly within" means: only rectangles whose y-range contains the entire band.
 * Caller guarantees y0,y1 are adjacent breakpoints from the union of all rect
 * y-coords, so a rect either fully covers the band or not at all.
 */
function bandIntervals(rects: Rect[], y0: number, y1: number): [number, number][] {
  const raw: [number, number][] = [];
  for (const r of rects) {
    if (r.yl <= y0 && r.yh >= y1) raw.push([r.xl, r.xh]);
  }
  raw.sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  for (const [xl, xh] of raw) {
    const top = out[out.length - 1];
    if (top && top[1] >= xl) {
      if (xh > top[1]) top[1] = xh;
    } else {
      out.push([xl, xh]);
    }
  }
  return out;
}

function intervalOp(a: [number, number][], b: [number, number][], op: BoolOp): [number, number][] {
  const xs = sortedUnique([...a, ...b].flatMap(([l, h]) => [l, h]));
  const out: [number, number][] = [];
  for (let i = 0; i + 1 < xs.length; i++) {
    const x0 = xs[i], x1 = xs[i + 1];
    const xm = (x0 + x1) / 2;
    const inA = a.some(([l, h]) => l <= xm && xm <= h);
    const inB = b.some(([l, h]) => l <= xm && xm <= h);
    let keep = false;
    switch (op) {
      case 'AND': keep = inA && inB; break;
      case 'OR':  keep = inA || inB; break;
      case 'XOR': keep = inA !== inB; break;
      case 'NOT': keep = inA && !inB; break;
    }
    if (keep) {
      const top = out[out.length - 1];
      if (top && top[1] === x0) top[1] = x1;
      else out.push([x0, x1]);
    }
  }
  return out;
}

/** Append [xl..xh] × [y0..y1] to the rect list, merging with the previous
 *  band if it shares the same x-interval. Output stays canonical. */
function pushBand(out: Rect[], xl: number, xh: number, y0: number, y1: number): void {
  // Find a rect in `out` with yh === y0 and matching x-interval.
  // Bands are produced in y-order, so candidates are at the tail.
  for (let i = out.length - 1; i >= 0; i--) {
    const r = out[i];
    if (r.yh < y0) break; // earlier bands won't match
    if (r.yh === y0 && r.xl === xl && r.xh === xh) {
      r.yh = y1;
      return;
    }
  }
  out.push({ xl, yl: y0, xh, yh: y1 });
}

/** Identity-OR with self — drives the rect list through the scanline so
 *  overlapping or touching rectangles emerge canonical. */
function canonicalize(rects: Rect[]): Rect[] {
  if (rects.length === 0) return [];
  return boolRects(rects, [], 'OR');
}
