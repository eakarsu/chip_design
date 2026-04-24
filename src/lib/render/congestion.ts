/**
 * Congestion heatmap.
 *
 * Estimates per-tile routing demand from net bounding boxes (Probabilistic
 * RUDY-style: each net spreads its half-perimeter weight uniformly over
 * its bounding-box tiles). Returns a 2-D demand grid plus a renderer that
 * paints it as an SVG heatmap, optionally overlaid with cell outlines.
 *
 * This is the same model commercial tools use for early-stage congestion
 * estimation before global routing — fast (O(nets · tiles_per_bbox)) and
 * good enough to drive placement decisions.
 */

import type { Cell, Net } from '@/types/algorithms';

export interface CongestionGrid {
  cols: number;
  rows: number;
  tile: number;
  /** demand[row][col]; row 0 is top. */
  demand: number[][];
  peak: number;
  mean: number;
}

export function computeCongestion(
  cells: Cell[],
  nets: Net[],
  chipWidth: number,
  chipHeight: number,
  tile = 50,
): CongestionGrid {
  const cols = Math.max(1, Math.ceil(chipWidth / tile));
  const rows = Math.max(1, Math.ceil(chipHeight / tile));
  const demand: number[][] = Array.from({ length: rows }, () => new Array(cols).fill(0));

  // Pin position lookup, including pin offsets if present.
  const pinPos = new Map<string, { x: number; y: number }>();
  for (const c of cells) {
    const cx = c.position?.x ?? 0;
    const cy = c.position?.y ?? 0;
    for (const p of c.pins ?? []) {
      pinPos.set(p.id, {
        x: cx + (p.position?.x ?? c.width / 2),
        y: cy + (p.position?.y ?? c.height / 2),
      });
    }
  }

  for (const net of nets) {
    const pts = (net.pins ?? [])
      .map(id => pinPos.get(id))
      .filter((p): p is { x: number; y: number } => !!p);
    if (pts.length < 2) continue;

    const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
    const xLo = Math.min(...xs), xHi = Math.max(...xs);
    const yLo = Math.min(...ys), yHi = Math.max(...ys);
    const halfPerim = (xHi - xLo) + (yHi - yLo);
    const weight = (net.weight ?? 1) * halfPerim;

    const c0 = Math.max(0, Math.floor(xLo / tile));
    const c1 = Math.min(cols - 1, Math.floor(xHi / tile));
    const r0 = Math.max(0, Math.floor(yLo / tile));
    const r1 = Math.min(rows - 1, Math.floor(yHi / tile));
    const tilesInBox = Math.max(1, (c1 - c0 + 1) * (r1 - r0 + 1));
    const perTile = weight / tilesInBox;

    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) demand[r][c] += perTile;
    }
  }

  let peak = 0, sum = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const d = demand[r][c];
      if (d > peak) peak = d;
      sum += d;
    }
  }
  return { cols, rows, tile, demand, peak, mean: sum / Math.max(1, cols * rows) };
}

/** Map a normalized [0,1] demand to a viridis-like gradient. */
function heatColor(t: number): string {
  // Cheap 5-stop ramp — close enough to viridis without a 256-entry LUT.
  const stops = [
    [68, 1, 84],     // 0.0 dark purple
    [59, 82, 139],   // 0.25 blue
    [33, 145, 140],  // 0.5 teal
    [94, 201, 98],   // 0.75 green
    [253, 231, 37],  // 1.0 yellow
  ];
  const x = Math.max(0, Math.min(1, t)) * (stops.length - 1);
  const i = Math.floor(x);
  const f = x - i;
  const a = stops[i];
  const b = stops[Math.min(i + 1, stops.length - 1)];
  const r = Math.round(a[0] * (1 - f) + b[0] * f);
  const g = Math.round(a[1] * (1 - f) + b[1] * f);
  const bb = Math.round(a[2] * (1 - f) + b[2] * f);
  return `rgb(${r},${g},${bb})`;
}

export interface HeatmapSvgOptions {
  width?: number;
  height?: number;
  showCells?: boolean;
}

export function renderCongestionSvg(
  grid: CongestionGrid,
  cells: Cell[] | undefined,
  chipWidth: number,
  chipHeight: number,
  opts: HeatmapSvgOptions = {},
): string {
  const w = opts.width ?? 800;
  const h = opts.height ?? 800;
  const sx = w / Math.max(1, chipWidth);
  const sy = h / Math.max(1, chipHeight);

  const out: string[] = [];
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" ` +
    `width="${w}" height="${h}">`,
  );
  out.push('<g>');
  for (let r = 0; r < grid.rows; r++) {
    for (let c = 0; c < grid.cols; c++) {
      const t = grid.peak > 0 ? grid.demand[r][c] / grid.peak : 0;
      const x = c * grid.tile * sx;
      const y = r * grid.tile * sy;
      const tw = grid.tile * sx;
      const th = grid.tile * sy;
      out.push(`<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${tw.toFixed(1)}" ` +
               `height="${th.toFixed(1)}" fill="${heatColor(t)}" fill-opacity="0.85"/>`);
    }
  }
  out.push('</g>');

  if (opts.showCells !== false && cells) {
    out.push('<g fill="none" stroke="#fff" stroke-width="0.6" opacity="0.7">');
    for (const cl of cells) {
      const x = (cl.position?.x ?? 0) * sx;
      const y = (cl.position?.y ?? 0) * sy;
      out.push(`<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" ` +
               `width="${(cl.width * sx).toFixed(1)}" height="${(cl.height * sy).toFixed(1)}"/>`);
    }
    out.push('</g>');
  }

  // Frame.
  out.push(`<rect x="0" y="0" width="${w}" height="${h}" fill="none" stroke="#fff" stroke-width="1" opacity="0.4"/>`);
  out.push('</svg>');
  return out.join('');
}
