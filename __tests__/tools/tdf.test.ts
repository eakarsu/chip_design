import { runTdf } from '@/lib/tools/tdf';

describe('runTdf', () => {
  it('produces a non-decreasing coverage curve', () => {
    const r = runTdf({
      pis: ['a', 'b', 'c'],
      gates: [
        { name: 'g1', op: 'and', inputs: ['a', 'b'] },
        { name: 'g2', op: 'or',  inputs: ['g1', 'c'] },
      ],
      pos: ['g2'],
      pairs: 64,
      seed: 7,
    });
    expect(r.total).toBe(10); // 5 nodes × {STR, STF}
    expect(r.coverage).toBeGreaterThan(0);
    for (let i = 1; i < r.curve.length; i++) {
      expect(r.curve[i]).toBeGreaterThanOrEqual(r.curve[i - 1]);
    }
  });

  it('throws on bad pairs', () => {
    expect(() => runTdf({
      pis: [], gates: [], pos: [], pairs: 0,
    })).toThrow();
  });
});
