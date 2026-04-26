/**
 * Parser for OpenROAD-style congestion reports.
 *
 * The shapes we recognise — both produced by `report_congestion` /
 * `report_global_route` in different OpenROAD versions:
 *
 *   1. Per-gcell rows:
 *        GCell (col, row)  H: used/cap = 12/16  V: used/cap = 8/16
 *      (one or more layers folded together; we treat this as the "all"
 *       layer when no layer column is given.)
 *
 *   2. Per-layer summary rows:
 *        Layer        Resource   Demand   Usage   Max H/V
 *        metal2       12345      6000     48.6%    5 / 8
 *
 * The first form populates a tile grid used to draw a heatmap; the second
 * form populates a per-layer summary table. Either or both may be present.
 */

export interface CongestionTile {
  col: number;
  row: number;
  /** Empty string = "any layer" / aggregate. */
  layer: string;
  hUsed: number; hCap: number;
  vUsed: number; vCap: number;
}

export interface LayerCongestion {
  layer: string;
  resource: number;
  demand: number;
  /** 0..1. */
  usage: number;
  maxH: number;
  maxV: number;
}

export interface CongestionReport {
  tiles: CongestionTile[];
  layers: LayerCongestion[];
  /** [maxCol+1, maxRow+1] — handy for sizing a canvas. */
  cols: number;
  rows: number;
  /** Worst per-tile usage ratio (max over layers), 0..1+. >1 means overflow. */
  peakUsage: number;
  /** Mean per-tile usage ratio. */
  meanUsage: number;
  warnings: string[];
}

const RE_TILE = /GCell\s*\(\s*(\d+)\s*,\s*(\d+)\s*\)\s*(?:layer\s+(\S+)\s+)?H[:=\s]+used\/cap\s*=\s*(\d+)\s*\/\s*(\d+)\s*V[:=\s]+used\/cap\s*=\s*(\d+)\s*\/\s*(\d+)/i;

// "metal2     12345      6000     48.6%     5 / 8"
const RE_LAYER = /^\s*([A-Za-z][\w]*)\s+(\d+)\s+(\d+)\s+([\d.]+)%\s+(\d+)\s*\/\s*(\d+)\s*$/;

export function parseCongestionReport(stdout: string): CongestionReport {
  const tiles: CongestionTile[] = [];
  const layers: LayerCongestion[] = [];
  const warnings: string[] = [];
  let cols = 0, rows = 0;

  for (const rawLine of stdout.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (!line) continue;

    const t = line.match(RE_TILE);
    if (t) {
      const [, c, r, layer, hu, hc, vu, vc] = t;
      const col = Number(c), row = Number(r);
      tiles.push({
        col, row,
        layer: layer ?? '',
        hUsed: Number(hu), hCap: Number(hc),
        vUsed: Number(vu), vCap: Number(vc),
      });
      if (col + 1 > cols) cols = col + 1;
      if (row + 1 > rows) rows = row + 1;
      continue;
    }

    const l = line.match(RE_LAYER);
    if (l) {
      const [, layer, resource, demand, usage, maxH, maxV] = l;
      layers.push({
        layer,
        resource: Number(resource),
        demand: Number(demand),
        usage: Number(usage) / 100,
        maxH: Number(maxH),
        maxV: Number(maxV),
      });
      continue;
    }
  }

  // Per-tile usage (max of H, V) → peak / mean.
  let peak = 0, sum = 0, n = 0;
  for (const t of tiles) {
    const hu = t.hCap > 0 ? t.hUsed / t.hCap : 0;
    const vu = t.vCap > 0 ? t.vUsed / t.vCap : 0;
    const u = Math.max(hu, vu);
    if (u > peak) peak = u;
    sum += u; n++;
  }

  if (tiles.length === 0 && layers.length === 0) {
    warnings.push('No congestion data recognised in input.');
  }

  return {
    tiles, layers, cols, rows,
    peakUsage: peak,
    meanUsage: n > 0 ? sum / n : 0,
    warnings,
  };
}

/**
 * Project a CongestionReport into a 2-D demand grid (one slot per (col,row),
 * value = max layer usage in that tile). The viewer uses this to drive its
 * canvas heatmap.
 */
export function tilesToGrid(report: CongestionReport): { grid: number[][]; cols: number; rows: number } {
  const cols = Math.max(1, report.cols);
  const rows = Math.max(1, report.rows);
  const grid: number[][] = Array.from({ length: rows }, () => new Array(cols).fill(0));
  for (const t of report.tiles) {
    const hu = t.hCap > 0 ? t.hUsed / t.hCap : 0;
    const vu = t.vCap > 0 ? t.vUsed / t.vCap : 0;
    const u = Math.max(hu, vu);
    if (u > grid[t.row][t.col]) grid[t.row][t.col] = u;
  }
  return { grid, cols, rows };
}

/** Cheap viridis-ish color for a normalised demand. */
export function congestionColor(t: number): string {
  const stops = [
    [68, 1, 84],
    [59, 82, 139],
    [33, 145, 140],
    [253, 231, 37],
    [220, 38, 38], // overflow → red
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
