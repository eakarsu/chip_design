import { estimateCache } from '@/lib/tools/cacti_lite';

describe('estimateCache', () => {
  it('computes geometry for a 32 KB 4-way 64 B cache', () => {
    const r = estimateCache({
      sizeBytes: 32 * 1024,
      lineBytes: 64,
      assoc: 4,
      addressBits: 48,
      techNm: 16,
    });
    expect(r.sets).toBe(128);
    expect(r.indexBits).toBe(7);
    expect(r.offsetBits).toBe(6);
    expect(r.tagBits).toBe(35);
    expect(r.accessNs).toBeGreaterThan(0);
    expect(r.energyPj).toBeGreaterThan(0);
  });

  it('larger associativity raises per-access energy', () => {
    const lo = estimateCache({
      sizeBytes: 64 * 1024, lineBytes: 64, assoc: 1,
      addressBits: 48, techNm: 16,
    });
    const hi = estimateCache({
      sizeBytes: 64 * 1024, lineBytes: 64, assoc: 16,
      addressBits: 48, techNm: 16,
    });
    // Energy scales with ways activated in parallel.
    expect(hi.energyPj).toBeGreaterThan(lo.energyPj);
  });

  it('rejects non-power-of-2 sets', () => {
    expect(() => estimateCache({
      sizeBytes: 100, lineBytes: 4, assoc: 1,
      addressBits: 32, techNm: 16,
    })).toThrow();
  });
});
