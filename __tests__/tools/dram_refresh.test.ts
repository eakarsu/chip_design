import { planRefresh } from '@/lib/tools/dram_refresh';

describe('planRefresh', () => {
  it('computes tREFI for typical DDR4', () => {
    const r = planRefresh({
      banks: 16,
      rowsPerBank: 1 << 16,
      colsPerRow: 1024,
      wordBits: 64,
      trfcNs: 350,
      tempC: 85,
      clockNs: 0.625,    // 1600 MT/s effective
    });
    // tREFI ≈ 64 ms / (16 × 65536) ≈ 61 ns per row at 85°C.
    expect(r.trefiNs).toBeGreaterThan(40);
    expect(r.trefiNs).toBeLessThan(80);
    expect(r.dutyPct).toBeGreaterThan(0);
  });

  it('halves retention at +10°C above 85°C', () => {
    const cool = planRefresh({
      banks: 8, rowsPerBank: 1024, colsPerRow: 1024, wordBits: 64,
      trfcNs: 200, tempC: 85, clockNs: 1,
    });
    const hot = planRefresh({
      banks: 8, rowsPerBank: 1024, colsPerRow: 1024, wordBits: 64,
      trfcNs: 200, tempC: 95, clockNs: 1,
    });
    expect(hot.effectiveTRefMs).toBeCloseTo(cool.effectiveTRefMs / 2, 3);
    expect(hot.dutyPct).toBeGreaterThan(cool.dutyPct);
  });

  it('throws on bad clock', () => {
    expect(() => planRefresh({
      banks: 1, rowsPerBank: 1, colsPerRow: 1, wordBits: 8,
      trfcNs: 1, tempC: 25, clockNs: 0,
    })).toThrow();
  });
});
