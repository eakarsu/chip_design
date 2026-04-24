/**
 * Routability / congestion estimators.
 *
 * Run *before* detailed routing to predict where the routing will be tight
 * — the same metric a global router uses to drive cell movement and net
 * weighting. Output is a per-tile demand grid.
 *
 *   1. **RUDY** (Spindler 2007) — Rectangular Uniform wire DensitY.
 *      For each net, take its pin bounding-box, divide its half-perimeter
 *      by its area, and smear that density uniformly over every tile the
 *      bbox touches. Cheap, surprisingly accurate.
 *
 *   2. **Probabilistic** (Lou 2002) — for each net assume *all* shortest
 *      L-shaped routes are equally likely; each tile in the bbox accrues
 *      probability mass proportional to how many of those L's pass through
 *      it. More accurate than RUDY for sparse nets.
 *
 * Both produce a `RoutingResult` so the existing UI can surface them
 * unchanged. We synthesize fake "wires" along each net's bbox edges so
 * the visualizer has something to draw, but the numerically meaningful
 * field is `congestion` (max tile demand / capacity).
 */

import {
  RoutingParams,
  RoutingResult,
  Wire,
  Net,
  Cell,
} from '@/types/algorithms';

interface PinPos { x: number; y: number }

function pinPositions(cells: Cell[]): Map<string, PinPos> {
  const m = new Map<string, PinPos>();
  for (const c of cells) {
    if (!c.position) continue;
    for (const p of c.pins) {
      m.set(p.id, {
        x: c.position.x + p.position.x,
        y: c.position.y + p.position.y,
      });
    }
  }
  return m;
}

interface NetBBox { net: Net; x1: number; y1: number; x2: number; y2: number }

function netBBoxes(nets: Net[], pins: Map<string, PinPos>): NetBBox[] {
  const out: NetBBox[] = [];
  for (const n of nets) {
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    let hits = 0;
    for (const pid of n.pins) {
      const pp = pins.get(pid);
      if (!pp) continue;
      hits++;
      if (pp.x < x1) x1 = pp.x;
      if (pp.x > x2) x2 = pp.x;
      if (pp.y < y1) y1 = pp.y;
      if (pp.y > y2) y2 = pp.y;
    }
    if (hits >= 2) out.push({ net: n, x1, y1, x2, y2 });
  }
  return out;
}

function bboxesToWires(bboxes: NetBBox[]): Wire[] {
  // For visualization only: draw an L from (x1,y1) → (x2,y1) → (x2,y2).
  return bboxes.map((b, i) => ({
    id: `cong_wire_${i}`,
    netId: b.net.id,
    points: [
      { x: b.x1, y: b.y1 },
      { x: b.x2, y: b.y1 },
      { x: b.x2, y: b.y2 },
    ],
    layer: 1,
    width: 1,
  }));
}

function buildGrid(width: number, height: number, gridSize: number): {
  cols: number; rows: number; tileW: number; tileH: number;
} {
  const cols = Math.max(1, Math.ceil(width / gridSize));
  const rows = Math.max(1, Math.ceil(height / gridSize));
  return { cols, rows, tileW: width / cols, tileH: height / rows };
}

/* --------------------------------------------------------------------- */
/* RUDY                                                                    */
/* --------------------------------------------------------------------- */

export function rudyCongestion(params: RoutingParams): RoutingResult {
  const start = performance.now();
  const gridSize = params.gridSize ?? 20;
  const { cols, rows, tileW, tileH } = buildGrid(params.chipWidth, params.chipHeight, gridSize);
  const demand = new Float64Array(cols * rows);

  const pins = pinPositions(params.cells);
  const bboxes = netBBoxes(params.nets, pins);

  for (const b of bboxes) {
    const w = Math.max(1, b.x2 - b.x1);
    const h = Math.max(1, b.y2 - b.y1);
    // Half-perimeter / area = "wire length per unit area" inside the bbox.
    const density = (w + h) / (w * h);

    const c1 = Math.max(0, Math.floor(b.x1 / tileW));
    const c2 = Math.min(cols - 1, Math.floor((b.x2 - 1e-9) / tileW));
    const r1 = Math.max(0, Math.floor(b.y1 / tileH));
    const r2 = Math.min(rows - 1, Math.floor((b.y2 - 1e-9) / tileH));
    for (let r = r1; r <= r2; r++) {
      for (let c = c1; c <= c2; c++) {
        demand[r * cols + c] += density;
      }
    }
  }

  const capacity = params.layers; // routing tracks per tile; 1 per layer is fine
  let peak = 0;
  for (const d of demand) if (d > peak) peak = d;
  const congestion = peak / capacity;

  return {
    success: true,
    wires: bboxesToWires(bboxes),
    totalWirelength: bboxes.reduce((s, b) => s + (b.x2 - b.x1) + (b.y2 - b.y1), 0),
    viaCount: 0,
    congestion,
    runtime: performance.now() - start,
    unroutedNets: [],
  };
}

/* --------------------------------------------------------------------- */
/* Probabilistic                                                           */
/* --------------------------------------------------------------------- */

/**
 * For a 2-pin net at (x1,y1)–(x2,y2), there are exactly two L-shaped routes
 * (over-the-top and under-the-bottom). Each tile in the bbox is on one of
 * them with probability:
 *
 *     p(tile (c,r)) = α · I[c == c1 or c == c2]                      (vertical leg)
 *                   + β · I[r == r1 or r == r2]                      (horizontal leg)
 *
 * For multi-pin nets we approximate by reducing to the bbox case.
 */
export function probabilisticCongestion(params: RoutingParams): RoutingResult {
  const start = performance.now();
  const gridSize = params.gridSize ?? 20;
  const { cols, rows, tileW, tileH } = buildGrid(params.chipWidth, params.chipHeight, gridSize);
  const demand = new Float64Array(cols * rows);

  const pins = pinPositions(params.cells);
  const bboxes = netBBoxes(params.nets, pins);

  for (const b of bboxes) {
    const c1 = Math.max(0, Math.floor(b.x1 / tileW));
    const c2 = Math.min(cols - 1, Math.floor((b.x2 - 1e-9) / tileW));
    const r1 = Math.max(0, Math.floor(b.y1 / tileH));
    const r2 = Math.min(rows - 1, Math.floor((b.y2 - 1e-9) / tileH));
    const dx = c2 - c1 + 1;
    const dy = r2 - r1 + 1;

    // Each L-shape: a vertical run on column c1 OR c2, horizontal run on row r1 OR r2.
    // Per tile probability inside bbox: 1/dy on each "corner column", 1/dx on each "corner row".
    for (let r = r1; r <= r2; r++) {
      // Vertical legs.
      demand[r * cols + c1] += 0.5 / dy;
      if (c2 !== c1) demand[r * cols + c2] += 0.5 / dy;
    }
    for (let c = c1; c <= c2; c++) {
      // Horizontal legs.
      demand[r1 * cols + c] += 0.5 / dx;
      if (r2 !== r1) demand[r2 * cols + c] += 0.5 / dx;
    }
  }

  const capacity = params.layers;
  let peak = 0;
  for (const d of demand) if (d > peak) peak = d;
  const congestion = peak / capacity;

  return {
    success: true,
    wires: bboxesToWires(bboxes),
    totalWirelength: bboxes.reduce((s, b) => s + (b.x2 - b.x1) + (b.y2 - b.y1), 0),
    viaCount: 0,
    congestion,
    runtime: performance.now() - start,
    unroutedNets: [],
  };
}
