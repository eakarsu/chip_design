/**
 * Thermal analysis.
 *
 * Power density times poor heat-extraction equals hotspots, which derate
 * timing (slower transistors), shorten lifetime (electromigration), and
 * in extreme cases melt bonds. Modern flows do thermal-aware placement
 * to avoid stacking high-power blocks on top of each other.
 *
 * Two algorithms here:
 *
 *   1. **Hotspot detection** — divide the die into a tile grid, sum the
 *      power dissipated by every cell whose center falls in each tile,
 *      report tiles whose density exceeds a threshold. Pure geometry —
 *      good first pass before paying for a full thermal solve.
 *
 *   2. **Thermal RC network** — build a simple 2D RC mesh where each
 *      tile is a thermal capacitance to ambient and is coupled to its
 *      4 neighbors via thermal resistance. Solve the steady-state
 *      temperature distribution by Gauss-Seidel iteration. Returns
 *      per-tile temperature (°C above ambient).
 */

import type { Cell } from '@/types/algorithms';

export interface ThermalParams {
  algorithm: 'hotspot_detection' | 'thermal_rc';
  cells: Cell[];
  /** Per-cell power in mW. If missing, we estimate as area × density. */
  powerByCell?: Record<string, number>;
  chipWidth: number;
  chipHeight: number;
  /** Tile pitch for the analysis grid. Default 50. */
  tilePitch?: number;
  /** Hotspot threshold in mW/µm² (only used by hotspot_detection). */
  hotspotThreshold?: number;
  /** Default power density in mW/µm² when powerByCell is missing. */
  defaultPowerDensity?: number;
  /** For thermal_rc: ambient-coupling thermal resistance per tile. K/W. */
  rAmbient?: number;
  /** For thermal_rc: lateral conduction thermal resistance per edge. K/W. */
  rLateral?: number;
}

export interface ThermalResult {
  success: boolean;
  /** cols × rows of either power density (mW/µm²) or temperature (°C). */
  grid: number[][];
  cols: number;
  rows: number;
  tilePitch: number;
  /** For hotspot_detection: list of {x, y, density} above threshold. */
  hotspots?: { col: number; row: number; value: number }[];
  /** Peak value (density or temp). */
  peak: number;
  runtime: number;
}

function powerOf(c: Cell, params: ThermalParams): number {
  if (params.powerByCell && params.powerByCell[c.id] !== undefined) {
    return params.powerByCell[c.id];
  }
  const density = params.defaultPowerDensity ?? 0.001; // mW/µm²
  return c.width * c.height * density;
}

/* --------------------------------------------------------------------- */
/* Hotspot detection                                                       */
/* --------------------------------------------------------------------- */

export function detectHotspots(params: ThermalParams): ThermalResult {
  const start = performance.now();
  const tile = params.tilePitch ?? 50;
  const cols = Math.max(1, Math.ceil(params.chipWidth / tile));
  const rows = Math.max(1, Math.ceil(params.chipHeight / tile));
  const tileArea = (params.chipWidth / cols) * (params.chipHeight / rows);

  // density[r][c] = mW per µm² in that tile.
  const power = Array.from({ length: rows }, () => new Array(cols).fill(0));
  for (const c of params.cells) {
    if (!c.position) continue;
    const cx = c.position.x + c.width / 2;
    const cy = c.position.y + c.height / 2;
    const col = Math.min(cols - 1, Math.max(0, Math.floor(cx / (params.chipWidth / cols))));
    const row = Math.min(rows - 1, Math.max(0, Math.floor(cy / (params.chipHeight / rows))));
    power[row][col] += powerOf(c, params);
  }

  const grid = power.map(row => row.map(p => p / tileArea));
  const threshold = params.hotspotThreshold ?? 0.0015; // mW/µm²
  const hotspots: ThermalResult['hotspots'] = [];
  let peak = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const v = grid[r][c];
      if (v > peak) peak = v;
      if (v > threshold) hotspots.push({ col: c, row: r, value: v });
    }
  }

  return {
    success: true,
    grid, cols, rows, tilePitch: tile,
    hotspots, peak,
    runtime: performance.now() - start,
  };
}

/* --------------------------------------------------------------------- */
/* Steady-state thermal RC solve                                           */
/* --------------------------------------------------------------------- */

/**
 * Per-tile node equation (steady-state):
 *
 *   P_tile = (T - T_ambient) / R_amb + Σ_neighbors (T - T_n) / R_lat
 *
 * Rearranged:
 *
 *   T = ( P_tile + T_ambient/R_amb + Σ T_n/R_lat ) / ( 1/R_amb + Σ 1/R_lat )
 *
 * Solve iteratively (Gauss-Seidel) until max-update < tolerance.
 */
export function thermalRcSolve(params: ThermalParams): ThermalResult {
  const start = performance.now();
  const tile = params.tilePitch ?? 50;
  const cols = Math.max(1, Math.ceil(params.chipWidth / tile));
  const rows = Math.max(1, Math.ceil(params.chipHeight / tile));
  const rAmb = params.rAmbient ?? 5.0;   // K/W per tile
  const rLat = params.rLateral ?? 0.5;   // K/W between adjacent tiles

  // Tile power in W (input cells are in mW → ÷1000).
  const power = Array.from({ length: rows }, () => new Array(cols).fill(0));
  for (const c of params.cells) {
    if (!c.position) continue;
    const cx = c.position.x + c.width / 2;
    const cy = c.position.y + c.height / 2;
    const col = Math.min(cols - 1, Math.max(0, Math.floor(cx / (params.chipWidth / cols))));
    const row = Math.min(rows - 1, Math.max(0, Math.floor(cy / (params.chipHeight / rows))));
    power[row][col] += powerOf(c, params) / 1000;
  }

  const T = Array.from({ length: rows }, () => new Array(cols).fill(0));
  const maxIter = 200;
  const tol = 1e-4;
  for (let iter = 0; iter < maxIter; iter++) {
    let maxDelta = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        let neighborSum = 0;
        let invSum = 1 / rAmb; // ambient conductance
        if (r > 0)        { neighborSum += T[r - 1][c] / rLat; invSum += 1 / rLat; }
        if (r < rows - 1) { neighborSum += T[r + 1][c] / rLat; invSum += 1 / rLat; }
        if (c > 0)        { neighborSum += T[r][c - 1] / rLat; invSum += 1 / rLat; }
        if (c < cols - 1) { neighborSum += T[r][c + 1] / rLat; invSum += 1 / rLat; }
        // Ambient temp = 0 (we report rise above ambient).
        const next = (power[r][c] + neighborSum) / invSum;
        const d = Math.abs(next - T[r][c]);
        if (d > maxDelta) maxDelta = d;
        T[r][c] = next;
      }
    }
    if (maxDelta < tol) break;
  }

  let peak = 0;
  for (const row of T) for (const v of row) if (v > peak) peak = v;
  return {
    success: true,
    grid: T, cols, rows, tilePitch: tile,
    peak,
    runtime: performance.now() - start,
  };
}

export function runThermal(params: ThermalParams): ThermalResult {
  switch (params.algorithm) {
    case 'hotspot_detection': return detectHotspots(params);
    case 'thermal_rc':        return thermalRcSolve(params);
  }
}
