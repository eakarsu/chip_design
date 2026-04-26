import {
  boolRects, sizeRects, unionRects, rectsArea, rectsBbox,
  polygonToRects, polygonsToRects, tracePolygons,
  type Rect,
} from '@/lib/geometry/polygon';

const R = (xl: number, yl: number, xh: number, yh: number): Rect => ({ xl, yl, xh, yh });

describe('polygon boolean engine — rectangle ops', () => {
  it('OR merges two overlapping rects into a canonical set', () => {
    const out = boolRects([R(0, 0, 10, 10)], [R(5, 5, 15, 15)], 'OR');
    expect(rectsArea(out)).toBe(10 * 10 + 10 * 10 - 5 * 5);
    const bb = rectsBbox(out)!;
    expect(bb).toEqual({ xl: 0, yl: 0, xh: 15, yh: 15 });
  });

  it('AND of two overlapping rects is the intersection rect', () => {
    const out = boolRects([R(0, 0, 10, 10)], [R(5, 5, 15, 15)], 'AND');
    expect(out).toEqual([R(5, 5, 10, 10)]);
  });

  it('XOR produces the symmetric-difference shape', () => {
    const out = boolRects([R(0, 0, 10, 10)], [R(5, 5, 15, 15)], 'XOR');
    // Total area = both shapes minus 2×intersection = 100 + 100 - 2*25 = 150
    expect(rectsArea(out)).toBe(150);
  });

  it('NOT subtracts the second from the first', () => {
    const out = boolRects([R(0, 0, 10, 10)], [R(5, 0, 10, 10)], 'NOT');
    expect(out).toEqual([R(0, 0, 5, 10)]);
  });

  it('NOT with disjoint rects is a no-op on A', () => {
    const out = boolRects([R(0, 0, 10, 10)], [R(20, 20, 30, 30)], 'NOT');
    expect(out).toHaveLength(1);
    expect(rectsArea(out)).toBe(100);
  });

  it('canonicalizes touching collinear rects via union', () => {
    const out = unionRects([R(0, 0, 5, 10), R(5, 0, 10, 10)]);
    expect(out).toEqual([R(0, 0, 10, 10)]);
  });
});

describe('polygon boolean engine — SIZE (offset)', () => {
  it('positive grow expands each side by delta and unions overlap', () => {
    const out = sizeRects([R(10, 10, 20, 20)], 5);
    expect(out).toEqual([R(5, 5, 25, 25)]);
  });

  it('positive grow merges nearby rects after expansion', () => {
    const out = sizeRects([R(0, 0, 10, 10), R(15, 0, 25, 10)], 3);
    // Each grows to span the gap; union should be one merged shape
    expect(out).toHaveLength(1);
    const bb = rectsBbox(out)!;
    expect(bb).toEqual({ xl: -3, yl: -3, xh: 28, yh: 13 });
  });

  it('negative shrink removes shapes narrower than 2*|delta|', () => {
    const out = sizeRects([R(0, 0, 4, 100)], -3);
    expect(out).toEqual([]);
  });
});

describe('polygon boolean engine — polygon I/O', () => {
  it('decomposes a rectilinear L-shape into bands', () => {
    // L:  (0,0)-(10,0)-(10,5)-(5,5)-(5,10)-(0,10) closed
    const rects = polygonToRects([
      { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 5 },
      { x: 5, y: 5 }, { x: 5, y: 10 }, { x: 0, y: 10 },
    ]);
    expect(rectsArea(rects)).toBe(75); // 10*5 + 5*5
  });

  it('falls back to bbox for non-Manhattan polygons', () => {
    const rects = polygonToRects([
      { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 8 },
    ]);
    expect(rects).toEqual([R(0, 0, 10, 8)]);
  });

  it('round-trips canonical rects through tracePolygons → polygonsToRects', () => {
    const orig = [R(0, 0, 10, 10), R(10, 0, 20, 10)];
    const traced = tracePolygons(orig);
    expect(traced.length).toBeGreaterThanOrEqual(1);
    const back = polygonsToRects(traced);
    expect(rectsArea(unionRects(back))).toBe(200);
  });
});
