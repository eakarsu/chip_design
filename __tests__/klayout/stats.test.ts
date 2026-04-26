import { computeLayerStats } from '@/lib/klayout/stats';
import type { FlatLayout } from '@/lib/klayout/flatten';

function flat(layers: { layer: number; datatype: number; rects: { xl: number; yl: number; xh: number; yh: number }[] }[]): FlatLayout {
  return {
    topCell: 'TOP',
    bbox: { xl: 0, yl: 0, xh: 100, yh: 100 },
    shapeCount: layers.reduce((n, l) => n + l.rects.length, 0),
    layers: layers.map(l => ({ ...l, polygons: [], paths: [] })),
  };
}

describe('computeLayerStats', () => {
  it('reports per-layer rect count + area + bbox', () => {
    const layout = flat([
      { layer: 1, datatype: 0, rects: [
        { xl: 0, yl: 0, xh: 10, yh: 10 },
        { xl: 20, yl: 0, xh: 30, yh: 10 },
      ] },
      { layer: 2, datatype: 0, rects: [{ xl: 0, yl: 50, xh: 100, yh: 60 }] },
    ]);
    const s = computeLayerStats(layout);
    expect(s.layers).toHaveLength(2);
    const l1 = s.layers[0];
    expect(l1.layer).toBe(1);
    expect(l1.rects).toBe(2);
    expect(l1.area).toBe(200);
    expect(l1.bbox).toEqual({ xl: 0, yl: 0, xh: 30, yh: 10 });
    const l2 = s.layers[1];
    expect(l2.area).toBe(1000);
  });

  it('sorts by layer then datatype', () => {
    const layout = flat([
      { layer: 5, datatype: 0, rects: [{ xl: 0, yl: 0, xh: 1, yh: 1 }] },
      { layer: 1, datatype: 1, rects: [{ xl: 0, yl: 0, xh: 1, yh: 1 }] },
      { layer: 1, datatype: 0, rects: [{ xl: 0, yl: 0, xh: 1, yh: 1 }] },
    ]);
    const s = computeLayerStats(layout);
    expect(s.layers.map(l => `${l.layer}/${l.datatype}`)).toEqual(['1/0', '1/1', '5/0']);
  });

  it('aggregates totals', () => {
    const layout = flat([
      { layer: 1, datatype: 0, rects: [{ xl: 0, yl: 0, xh: 10, yh: 10 }] },
      { layer: 2, datatype: 0, rects: [{ xl: 0, yl: 0, xh: 5, yh: 5 }, { xl: 10, yl: 0, xh: 15, yh: 5 }] },
    ]);
    const s = computeLayerStats(layout);
    expect(s.totals.rects).toBe(3);
    expect(s.totals.summedArea).toBe(100 + 25 + 25);
    expect(s.totals.layerCount).toBe(2);
  });

  it('returns null bbox for an empty layout', () => {
    const layout = flat([]);
    const s = computeLayerStats(layout);
    expect(s.bbox).toBeNull();
    expect(s.totals.rects).toBe(0);
  });
});
