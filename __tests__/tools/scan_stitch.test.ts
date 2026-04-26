import { stitchScan } from '@/lib/tools/scan_stitch';

describe('stitchScan', () => {
  it('partitions flops into chains and orders by NN', () => {
    const flops = Array.from({ length: 8 }, (_, i) => ({
      name: `f${i}`, x: i, y: 0,
    }));
    const r = stitchScan({ flops, numChains: 2, scanIn: { x: 0, y: 0 } });
    expect(r.chains).toHaveLength(2);
    expect(r.chains[0].order.length + r.chains[1].order.length).toBe(8);
    expect(r.totalWire).toBeGreaterThan(0);
  });

  it('balances chain lengths under round-robin bucketing', () => {
    const flops = Array.from({ length: 9 }, (_, i) => ({
      name: `f${i}`, x: i % 3, y: Math.floor(i / 3),
    }));
    const r = stitchScan({ flops, numChains: 3 });
    expect(r.imbalance).toBeLessThanOrEqual(1);
  });

  it('handles empty flops', () => {
    const r = stitchScan({ flops: [], numChains: 2 });
    expect(r.totalWire).toBe(0);
    expect(r.longestChain).toBe(0);
  });

  it('throws on bad numChains', () => {
    expect(() => stitchScan({ flops: [], numChains: 0 })).toThrow();
  });
});
