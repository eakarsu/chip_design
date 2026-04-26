import { planSram } from '@/lib/tools/sram_planner';

describe('planSram', () => {
  it('picks a viable plan within access target', () => {
    const r = planSram({
      capacityBits: 1 << 20,
      wordBits: 64,
      cellAreaUm2: 0.07,
      muxFactor: 4,
      targetAccessNs: 1.0,
    });
    expect(r.best.totalBits).toBeGreaterThanOrEqual(1 << 20);
    expect(r.best.accessNs).toBeLessThanOrEqual(1.0);
  });

  it('falls back to fastest if target unreachable', () => {
    const r = planSram({
      capacityBits: 1 << 20,
      wordBits: 64,
      cellAreaUm2: 0.07,
      muxFactor: 4,
      targetAccessNs: 0.01,
    });
    expect(r.notes.some(n => /no plan meets target/.test(n))).toBe(true);
  });

  it('throws on bad muxFactor', () => {
    expect(() => planSram({
      capacityBits: 1024, wordBits: 8, cellAreaUm2: 0.07,
      muxFactor: 3, targetAccessNs: 1,
    })).toThrow();
  });
});
