/**
 * @jest-environment node
 */
import {
  detectHotspots,
  thermalRcSolve,
  runThermal,
} from '@/lib/algorithms/thermal';
import { Cell } from '@/types/algorithms';

function makeCells(positions: { x: number; y: number; w?: number; h?: number }[]): Cell[] {
  return positions.map((p, i) => ({
    id: `c${i}`,
    name: `c${i}`,
    width: p.w ?? 30,
    height: p.h ?? 30,
    position: { x: p.x, y: p.y },
    pins: [],
    type: 'standard',
  }));
}

describe('Thermal — hotspot detection', () => {
  test('returns a grid sized by chip dims and tile pitch', () => {
    const cells = makeCells([
      { x: 50, y: 50 },
      { x: 200, y: 200 },
    ]);
    const r = detectHotspots({
      algorithm: 'hotspot_detection',
      cells,
      chipWidth: 500,
      chipHeight: 500,
      tilePitch: 100,
    });
    expect(r.success).toBe(true);
    expect(r.cols).toBe(5);
    expect(r.rows).toBe(5);
    expect(r.grid.length).toBe(5);
    expect(r.grid[0].length).toBe(5);
  });

  test('flags hotspot when many cells stack in one tile', () => {
    // Pack 20 cells into the same small region so density > threshold
    const stacked = makeCells(
      Array.from({ length: 20 }, () => ({ x: 50, y: 50, w: 10, h: 10 }))
    );
    const r = detectHotspots({
      algorithm: 'hotspot_detection',
      cells: stacked,
      chipWidth: 500,
      chipHeight: 500,
      tilePitch: 100,
      hotspotThreshold: 0.0001,
      defaultPowerDensity: 0.01,
    });
    expect(r.hotspots && r.hotspots.length).toBeGreaterThan(0);
    expect(r.peak).toBeGreaterThan(0);
  });

  test('handles empty cells without throwing', () => {
    const r = detectHotspots({
      algorithm: 'hotspot_detection',
      cells: [],
      chipWidth: 100,
      chipHeight: 100,
    });
    expect(r.success).toBe(true);
    expect(r.peak).toBe(0);
  });
});

describe('Thermal — RC solve', () => {
  test('produces non-negative temperature grid', () => {
    const cells = makeCells([
      { x: 100, y: 100 },
      { x: 250, y: 250 },
      { x: 400, y: 100 },
    ]);
    const r = thermalRcSolve({
      algorithm: 'thermal_rc',
      cells,
      chipWidth: 500,
      chipHeight: 500,
      tilePitch: 100,
      defaultPowerDensity: 0.01,
    });
    expect(r.success).toBe(true);
    for (const row of r.grid) {
      for (const v of row) expect(v).toBeGreaterThanOrEqual(0);
    }
    expect(r.peak).toBeGreaterThan(0);
  });

  test('peak temperature occurs at or near the tile with most power', () => {
    // Single large powered cell at center
    const cells = makeCells([{ x: 200, y: 200, w: 100, h: 100 }]);
    const r = thermalRcSolve({
      algorithm: 'thermal_rc',
      cells,
      chipWidth: 500,
      chipHeight: 500,
      tilePitch: 100,
      defaultPowerDensity: 0.05,
    });
    // Find tile with peak; cell center is (250,250) → tile (2,2)
    let peakR = 0, peakC = 0;
    for (let r2 = 0; r2 < r.rows; r2++) {
      for (let c = 0; c < r.cols; c++) {
        if (r.grid[r2][c] > r.grid[peakR][peakC]) { peakR = r2; peakC = c; }
      }
    }
    expect(peakR).toBe(2);
    expect(peakC).toBe(2);
  });
});

describe('Thermal — dispatcher', () => {
  test('routes by algorithm field', () => {
    const cells = makeCells([{ x: 100, y: 100 }]);
    const hs = runThermal({
      algorithm: 'hotspot_detection',
      cells,
      chipWidth: 500,
      chipHeight: 500,
    });
    const rc = runThermal({
      algorithm: 'thermal_rc',
      cells,
      chipWidth: 500,
      chipHeight: 500,
    });
    expect(hs.success).toBe(true);
    expect(rc.success).toBe(true);
  });
});
