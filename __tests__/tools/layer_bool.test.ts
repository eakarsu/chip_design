import { layerBool, layerSize, totalArea } from '@/lib/tools/layer_bool';

describe('layerBool', () => {
  it('OR merges overlapping rects', () => {
    const a = [{ x1: 0, y1: 0, x2: 10, y2: 10 }];
    const b = [{ x1: 5, y1: 5, x2: 15, y2: 15 }];
    const r = layerBool(a, b, 'or');
    expect(totalArea(r)).toBeCloseTo(175, 6); // 10*10 + 10*10 - 5*5
  });

  it('AND yields the intersection', () => {
    const a = [{ x1: 0, y1: 0, x2: 10, y2: 10 }];
    const b = [{ x1: 5, y1: 5, x2: 15, y2: 15 }];
    const r = layerBool(a, b, 'and');
    expect(r).toHaveLength(1);
    expect(r[0]).toEqual({ x1: 5, y1: 5, x2: 10, y2: 10 });
  });

  it('XOR yields the symmetric difference', () => {
    const a = [{ x1: 0, y1: 0, x2: 10, y2: 10 }];
    const b = [{ x1: 5, y1: 5, x2: 15, y2: 15 }];
    const r = layerBool(a, b, 'xor');
    expect(totalArea(r)).toBeCloseTo(150, 6); // (100-25) + (100-25)
  });

  it('NOT subtracts B from A', () => {
    const a = [{ x1: 0, y1: 0, x2: 10, y2: 10 }];
    const b = [{ x1: 0, y1: 0, x2: 5,  y2: 10 }];
    const r = layerBool(a, b, 'not');
    expect(r).toHaveLength(1);
    expect(r[0]).toEqual({ x1: 5, y1: 0, x2: 10, y2: 10 });
  });

  it('handles disjoint rects in OR', () => {
    const a = [{ x1: 0, y1: 0, x2: 1, y2: 1 }];
    const b = [{ x1: 5, y1: 5, x2: 6, y2: 6 }];
    const r = layerBool(a, b, 'or');
    expect(r).toHaveLength(2);
    expect(totalArea(r)).toBeCloseTo(2, 6);
  });

  it('returns empty when both inputs empty', () => {
    expect(layerBool([], [], 'or')).toEqual([]);
  });
});

describe('layerSize', () => {
  it('inflates by a positive delta', () => {
    const r = layerSize([{ x1: 0, y1: 0, x2: 10, y2: 10 }], 1);
    expect(r).toHaveLength(1);
    expect(r[0]).toEqual({ x1: -1, y1: -1, x2: 11, y2: 11 });
  });

  it('shrinks and drops vanishing rects', () => {
    const r = layerSize([
      { x1: 0, y1: 0, x2: 10, y2: 10 },
      { x1: 0, y1: 0, x2: 0.5, y2: 0.5 }, // shrinks to nothing under -1
    ], -1);
    expect(r).toHaveLength(1);
    expect(r[0]).toEqual({ x1: 1, y1: 1, x2: 9, y2: 9 });
  });

  it('merges inflated overlapping rects', () => {
    const r = layerSize([
      { x1: 0, y1: 0, x2: 10, y2: 10 },
      { x1: 12, y1: 0, x2: 22, y2: 10 },
    ], 2);
    // After +2 inflation, [-2..12] and [10..24] touch at x=12 and merge.
    expect(r.length).toBe(1);
  });
});
