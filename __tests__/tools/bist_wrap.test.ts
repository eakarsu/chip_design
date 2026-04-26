import { planBistWrap } from '@/lib/tools/bist_wrap';

describe('planBistWrap', () => {
  it('reports per-mem and aggregate gates', () => {
    const r = planBistWrap({
      memories: [
        { name: 'a', width: 32, addrBits: 10 },
        { name: 'b', width: 64, addrBits: 12 },
      ],
    });
    expect(r.reports).toHaveLength(2);
    expect(r.totalGates).toBeGreaterThan(0);
    expect(r.sharedTpgGates).toBeGreaterThan(0);
  });

  it('caps diagGroups at memory count', () => {
    const r = planBistWrap({
      memories: [{ name: 'a', width: 8, addrBits: 8 }],
      diagGroups: 16,
    });
    expect(r.diagGroups).toBe(1);
    expect(r.diagResolution).toBe(1);
  });

  it('throws on missing memories', () => {
    expect(() => planBistWrap({ memories: [] })).toThrow();
  });
});
