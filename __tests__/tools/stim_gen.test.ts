import { generateStim } from '@/lib/tools/stim_gen';

describe('generateStim', () => {
  it('respects field bit-widths', () => {
    const r = generateStim({
      fields: [{ name: 'op', width: 3 }],
      vectors: 200, seed: 1,
    });
    for (const v of r.vectors) {
      expect(v.op).toBeGreaterThanOrEqual(0);
      expect(v.op).toBeLessThanOrEqual(7);
    }
  });

  it('respects weighted dist ranges', () => {
    const r = generateStim({
      fields: [{
        name: 'addr', width: 32,
        dist: [
          { min: 0, max: 99, weight: 9 },
          { min: 1000, max: 1099, weight: 1 },
        ],
      }],
      vectors: 1000, seed: 2,
    });
    const small = r.vectors.filter(v => v.addr < 100).length;
    const big   = r.vectors.filter(v => v.addr >= 1000).length;
    expect(small + big).toBe(1000);
    // ~9:1 ratio — allow generous slack.
    expect(small).toBeGreaterThan(big * 4);
  });

  it('applies cross-field constraint via rejection', () => {
    const r = generateStim({
      fields: [
        { name: 'a', width: 4 }, { name: 'b', width: 4 },
      ],
      vectors: 50, seed: 3, maxRetries: 256,
      constraint: v => v.a + v.b < 10,
    });
    for (const v of r.vectors) expect(v.a + v.b).toBeLessThan(10);
  });

  it('throws when constraint unsatisfiable', () => {
    expect(() => generateStim({
      fields: [{ name: 'a', width: 1 }],
      vectors: 1, maxRetries: 4,
      constraint: () => false,
    })).toThrow();
  });
});
