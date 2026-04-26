import { combineHotspots } from '@/lib/tools/rel_hotspot';

describe('combineHotspots', () => {
  it('computes Euclidean score per tile', () => {
    const r = combineHotspots(
      { cols: 2, rows: 1, data: [3, 0] },
      { cols: 2, rows: 1, data: [4, 0] },
    );
    expect(r.scoreGrid.data[0]).toBe(5);
    expect(r.scoreGrid.data[1]).toBe(0);
    expect(r.maxScore).toBe(5);
  });

  it('orders worst tiles by descending score', () => {
    const r = combineHotspots(
      { cols: 3, rows: 1, data: [0.1, 0.5, 0.9] },
      { cols: 3, rows: 1, data: [0.1, 0.5, 0.9] },
      3,
    );
    expect(r.worst[0].col).toBe(2);
    expect(r.worst[2].col).toBe(0);
  });

  it('throws on shape mismatch', () => {
    expect(() => combineHotspots(
      { cols: 1, rows: 1, data: [0] },
      { cols: 2, rows: 1, data: [0, 0] },
    )).toThrow();
  });

  it('throws on length mismatch', () => {
    expect(() => combineHotspots(
      { cols: 2, rows: 2, data: [0] },
      { cols: 2, rows: 2, data: [0] },
    )).toThrow();
  });
});
