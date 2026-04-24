import { solveIRDrop, solveThermal, edgeDirichlet } from '@/lib/algorithms/fea_solver';

describe('FEA solver — IR drop', () => {
  it('zero current gives zero drop (voltage equals pad everywhere)', () => {
    const nx = 10, ny = 10;
    const currents = new Float64Array(nx * ny); // zeros
    const sheetR = new Float64Array(nx * ny).fill(1);
    const res = solveIRDrop({
      grid: { nx, ny, dx: 1, dy: 1 },
      currentMap: currents,
      sheetR,
      padVoltage: 1.0,
    });
    // Since pad = 1V everywhere on the edge and there's no current source,
    // the steady-state interior voltage is also 1V.
    for (let i = 0; i < res.field.length; i++) {
      expect(res.field[i]).toBeCloseTo(1.0, 5);
    }
  });

  it('a central current source produces a local dip', () => {
    const nx = 21, ny = 21;
    const currents = new Float64Array(nx * ny);
    currents[Math.floor(ny / 2) * nx + Math.floor(nx / 2)] = -0.5; // current OUT
    const sheetR = new Float64Array(nx * ny).fill(0.5);
    const res = solveIRDrop({
      grid: { nx, ny, dx: 1, dy: 1 },
      currentMap: currents,
      sheetR,
      padVoltage: 1.0,
    });
    const centre = res.field[Math.floor(ny / 2) * nx + Math.floor(nx / 2)];
    // Drop should be positive (below 1V) and bounded.
    expect(centre).toBeLessThan(1.0);
    expect(centre).toBeGreaterThan(0.0);
  });

  it('higher sheet resistance produces a larger drop', () => {
    const nx = 15, ny = 15;
    const currents = new Float64Array(nx * ny);
    currents[Math.floor(ny / 2) * nx + Math.floor(nx / 2)] = -0.2;

    const low = solveIRDrop({
      grid: { nx, ny, dx: 1, dy: 1 },
      currentMap: currents,
      sheetR: new Float64Array(nx * ny).fill(0.1),
      padVoltage: 1.0,
    });
    const high = solveIRDrop({
      grid: { nx, ny, dx: 1, dy: 1 },
      currentMap: currents,
      sheetR: new Float64Array(nx * ny).fill(2.0),
      padVoltage: 1.0,
    });
    const dropLow  = 1.0 - low.peakAt ? 0 : 0; // unused; we just compare min field
    const minLow  = Math.min(...low.field);
    const minHigh = Math.min(...high.field);
    expect(minHigh).toBeLessThan(minLow);
  });

  it('edgeDirichlet pins only the border and leaves NaN in the interior', () => {
    const pads = edgeDirichlet(5, 5, 0.9);
    // Corners and edges pinned:
    expect(pads[0]).toBe(0.9);
    expect(pads[4]).toBe(0.9);
    expect(pads[20]).toBe(0.9);
    // Interior left NaN:
    expect(Number.isNaN(pads[12])).toBe(true);
  });
});

describe('FEA solver — Thermal', () => {
  it('no power dissipation returns ambient everywhere', () => {
    const nx = 10, ny = 10;
    const res = solveThermal({
      grid: { nx, ny, dx: 1, dy: 1 },
      powerMap: new Float64Array(nx * ny),
      k: 150,
      tAmbient: 25,
    });
    for (let i = 0; i < res.field.length; i++) {
      expect(res.field[i]).toBeCloseTo(25, 5);
    }
  });

  it('a hot spot raises local temperature above ambient', () => {
    const nx = 21, ny = 21;
    const power = new Float64Array(nx * ny);
    power[Math.floor(ny / 2) * nx + Math.floor(nx / 2)] = 5;
    const res = solveThermal({
      grid: { nx, ny, dx: 1, dy: 1 },
      powerMap: power, k: 1.0, tAmbient: 25,
    });
    expect(res.peak).toBeGreaterThan(25);
    // Hot spot should be near the centre.
    expect(res.peakAt.i).toBeGreaterThanOrEqual(nx / 2 - 1);
    expect(res.peakAt.i).toBeLessThanOrEqual(nx / 2 + 1);
  });

  it('doubling power roughly doubles the temperature rise (linear PDE)', () => {
    const nx = 15, ny = 15;
    const cx = Math.floor(nx / 2), cy = Math.floor(ny / 2);

    const p1 = new Float64Array(nx * ny); p1[cy * nx + cx] = 1;
    const p2 = new Float64Array(nx * ny); p2[cy * nx + cx] = 2;

    const r1 = solveThermal({ grid:{nx,ny,dx:1,dy:1}, powerMap: p1, k: 1, tAmbient: 0 });
    const r2 = solveThermal({ grid:{nx,ny,dx:1,dy:1}, powerMap: p2, k: 1, tAmbient: 0 });
    expect(r2.peak).toBeCloseTo(2 * r1.peak, 3);
  });

  it('higher conductivity k reduces peak temperature', () => {
    const nx = 15, ny = 15;
    const cx = Math.floor(nx / 2), cy = Math.floor(ny / 2);
    const power = new Float64Array(nx * ny); power[cy * nx + cx] = 1;

    const rLo = solveThermal({ grid:{nx,ny,dx:1,dy:1}, powerMap: power, k: 0.5, tAmbient: 0 });
    const rHi = solveThermal({ grid:{nx,ny,dx:1,dy:1}, powerMap: power, k: 10,  tAmbient: 0 });
    expect(rHi.peak).toBeLessThan(rLo.peak);
  });
});
