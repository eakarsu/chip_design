import { diffLayouts } from '@/lib/klayout/diff';
import type { FlatLayout } from '@/lib/klayout/flatten';

function flat(layers: { layer: number; datatype: number; rects: { xl: number; yl: number; xh: number; yh: number }[] }[]): FlatLayout {
  return {
    topCell: 'TOP',
    bbox: { xl: 0, yl: 0, xh: 100, yh: 100 },
    shapeCount: layers.reduce((n, l) => n + l.rects.length, 0),
    layers: layers.map(l => ({ ...l, polygons: [], paths: [] })),
  };
}

describe('diffLayouts', () => {
  it('produces empty added/removed when A === B', () => {
    const A = flat([{ layer: 1, datatype: 0, rects: [{ xl: 0, yl: 0, xh: 10, yh: 10 }] }]);
    const B = flat([{ layer: 1, datatype: 0, rects: [{ xl: 0, yl: 0, xh: 10, yh: 10 }] }]);
    const d = diffLayouts(A, B);
    expect(d.layers).toHaveLength(1);
    expect(d.layers[0].addedArea).toBe(0);
    expect(d.layers[0].removedArea).toBe(0);
    expect(d.layers[0].commonArea).toBe(100);
    expect(d.totals.added).toBe(0);
    expect(d.totals.removed).toBe(0);
  });

  it('detects new geometry on the same layer', () => {
    const A = flat([{ layer: 1, datatype: 0, rects: [{ xl: 0, yl: 0, xh: 10, yh: 10 }] }]);
    const B = flat([{
      layer: 1, datatype: 0,
      rects: [
        { xl: 0,  yl: 0,  xh: 10, yh: 10 },     // shared
        { xl: 20, yl: 0,  xh: 30, yh: 10 },     // new
      ],
    }]);
    const d = diffLayouts(A, B);
    const l = d.layers[0];
    expect(l.addedArea).toBe(100);   // 10 × 10 new rect
    expect(l.removedArea).toBe(0);
    expect(l.commonArea).toBe(100);
    expect(d.totals.added).toBe(100);
  });

  it('detects removed geometry on the same layer', () => {
    const A = flat([{
      layer: 2, datatype: 0,
      rects: [
        { xl: 0,  yl: 0,  xh: 5,  yh: 5  },
        { xl: 10, yl: 0,  xh: 15, yh: 5  },
      ],
    }]);
    const B = flat([{ layer: 2, datatype: 0, rects: [{ xl: 0, yl: 0, xh: 5, yh: 5 }] }]);
    const d = diffLayouts(A, B);
    const l = d.layers.find(x => x.layer === 2)!;
    expect(l.removedArea).toBe(25);
    expect(l.addedArea).toBe(0);
    expect(l.commonArea).toBe(25);
  });

  it('reports layers that only exist in A or only in B', () => {
    const A = flat([{ layer: 5, datatype: 0, rects: [{ xl: 0, yl: 0, xh: 1, yh: 1 }] }]);
    const B = flat([{ layer: 7, datatype: 0, rects: [{ xl: 2, yl: 2, xh: 3, yh: 3 }] }]);
    const d = diffLayouts(A, B);
    expect(d.layersOnlyInA.find(l => l.layer === 5)).toBeDefined();
    expect(d.layersOnlyInB.find(l => l.layer === 7)).toBeDefined();
    // layer 5: removed=1 area, added=0
    expect(d.layers.find(l => l.layer === 5)!.removedArea).toBe(1);
    expect(d.layers.find(l => l.layer === 7)!.addedArea).toBe(1);
  });

  it('respects datatype as part of the key', () => {
    const A = flat([{ layer: 1, datatype: 0, rects: [{ xl: 0, yl: 0, xh: 5, yh: 5 }] }]);
    const B = flat([{ layer: 1, datatype: 1, rects: [{ xl: 0, yl: 0, xh: 5, yh: 5 }] }]);
    const d = diffLayouts(A, B);
    // Two distinct (layer, datatype) entries — neither overlaps the other.
    expect(d.layers).toHaveLength(2);
    expect(d.totals.common).toBe(0);
    expect(d.totals.added).toBe(25);
    expect(d.totals.removed).toBe(25);
  });
});
