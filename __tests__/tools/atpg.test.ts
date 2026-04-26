import { runAtpg } from '@/lib/tools/atpg';

describe('runAtpg', () => {
  it('reaches high coverage on a small AND-OR netlist', () => {
    const r = runAtpg({
      pis: ['a', 'b', 'c'],
      gates: [
        { name: 'g1', op: 'and', inputs: ['a', 'b'] },
        { name: 'g2', op: 'or',  inputs: ['g1', 'c'] },
      ],
      pos: ['g2'],
      vectors: 64,
      seed: 42,
    });
    expect(r.total).toBe(10); // 5 nodes × 2 stuck-at
    expect(r.coverage).toBeGreaterThan(0.7);
    expect(r.curve).toHaveLength(64);
    // Coverage curve must be non-decreasing.
    for (let i = 1; i < r.curve.length; i++) {
      expect(r.curve[i]).toBeGreaterThanOrEqual(r.curve[i - 1]);
    }
  });

  it('throws on cycle', () => {
    expect(() => runAtpg({
      pis: ['a'], pos: ['g1'],
      gates: [
        { name: 'g1', op: 'and', inputs: ['g2', 'a'] },
        { name: 'g2', op: 'and', inputs: ['g1', 'a'] },
      ],
      vectors: 4,
    })).toThrow();
  });

  it('throws on zero vectors', () => {
    expect(() => runAtpg({
      pis: [], gates: [], pos: [], vectors: 0,
    })).toThrow();
  });
});
