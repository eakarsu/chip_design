import { computeDensity, densityColor } from '@/lib/klayout/density';
import type { FlatLayout } from '@/lib/klayout/flatten';

function flat(layers: { layer: number; datatype: number; rects: { xl: number; yl: number; xh: number; yh: number }[] }[], bbox = { xl: 0, yl: 0, xh: 100, yh: 100 }): FlatLayout {
  return {
    topCell: 'TOP',
    bbox,
    shapeCount: layers.reduce((n, l) => n + l.rects.length, 0),
    layers: layers.map(l => ({ ...l, polygons: [], paths: [] })),
  };
}

describe('computeDensity', () => {
  it('produces a 100% bin where the layer covers the whole bin', () => {
    // Single 10×10 bin grid over a 10×10 layout, fully covered.
    const layout = flat(
      [{ layer: 1, datatype: 0, rects: [{ xl: 0, yl: 0, xh: 10, yh: 10 }] }],
      { xl: 0, yl: 0, xh: 10, yh: 10 },
    );
    const r = computeDensity(layout, { binsX: 1, binsY: 1 });
    expect(r.density[0][0]).toBeCloseTo(1.0);
    expect(r.max).toBeCloseTo(1.0);
    expect(r.min).toBeCloseTo(1.0);
    expect(r.mean).toBeCloseTo(1.0);
  });

  it('correctly bins partial coverage across multiple cells', () => {
    // 2×2 bins on 10×10. A rect covering the lower-left quadrant (5×5)
    // entirely fills bin (0,0) and leaves the others empty.
    const layout = flat(
      [{ layer: 1, datatype: 0, rects: [{ xl: 0, yl: 0, xh: 5, yh: 5 }] }],
      { xl: 0, yl: 0, xh: 10, yh: 10 },
    );
    const r = computeDensity(layout, { binsX: 2, binsY: 2 });
    expect(r.density[0][0]).toBeCloseTo(1.0);
    expect(r.density[0][1]).toBeCloseTo(0);
    expect(r.density[1][0]).toBeCloseTo(0);
    expect(r.density[1][1]).toBeCloseTo(0);
    expect(r.mean).toBeCloseTo(0.25);
  });

  it('respects the layers filter', () => {
    const layout = flat([
      { layer: 1, datatype: 0, rects: [{ xl: 0, yl: 0, xh: 10, yh: 10 }] },
      { layer: 2, datatype: 0, rects: [{ xl: 0, yl: 0, xh: 10, yh: 10 }] },
    ], { xl: 0, yl: 0, xh: 10, yh: 10 });
    const onlyL2 = computeDensity(layout, { binsX: 1, layers: [{ layer: 2 }] });
    expect(onlyL2.density[0][0]).toBeCloseTo(1);
    const both = computeDensity(layout, { binsX: 1 });
    // Two layers, each 100% — clamped to 1 per bin.
    expect(both.density[0][0]).toBeCloseTo(1);
  });

  it('handles a rect that crosses bin boundaries with partial overlap', () => {
    // 4×4 grid on 8×8; rect from (2..6, 2..6) covers half of the four
    // central bins (each 2×2 area, rect contributes 2×2 = 4 = 100%).
    const layout = flat(
      [{ layer: 1, datatype: 0, rects: [{ xl: 2, yl: 2, xh: 6, yh: 6 }] }],
      { xl: 0, yl: 0, xh: 8, yh: 8 },
    );
    const r = computeDensity(layout, { binsX: 4, binsY: 4 });
    expect(r.density[1][1]).toBeCloseTo(1);
    expect(r.density[1][2]).toBeCloseTo(1);
    expect(r.density[2][1]).toBeCloseTo(1);
    expect(r.density[2][2]).toBeCloseTo(1);
    expect(r.density[0][0]).toBeCloseTo(0);
  });
});

describe('densityColor', () => {
  it('returns transparent for d=0', () => {
    expect(densityColor(0)).toMatch(/rgba\(0,0,0,0\)/);
  });
  it('returns a coloured rgba for non-zero density', () => {
    expect(densityColor(0.5)).toMatch(/^rgba\(/);
    expect(densityColor(1.0)).toMatch(/^rgba\(/);
  });
});
