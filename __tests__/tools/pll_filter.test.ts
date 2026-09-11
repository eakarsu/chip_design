import { calcPllFilter } from '@/lib/tools/pll_filter';
describe('calcPllFilter', () => {
  it('produces sensible R, C1, C2 for a 1 MHz BW PLL', () => {
    const r = calcPllFilter({
      fref: 25e6, fvco: 2.5e9, fc: 250e3, pmDeg: 60,
      kvco: 500e6, icp: 100e-6,
    });
    expect(r.N).toBeCloseTo(100);
    expect(r.R).toBeGreaterThan(100);
    expect(r.C1).toBeGreaterThan(0);
    expect(r.C2).toBeGreaterThan(0);
    // b = (1 + sin PM)/(1 − sin PM) for 60°
    expect(r.b).toBeCloseTo(13.928, 2);
    // Achieved PM must hit the target
    expect(Math.abs(r.pmActualDeg - 60)).toBeLessThan(0.5);
  });
  it('throws on bad PM', () => {
    expect(() => calcPllFilter({
      fref: 25e6, fvco: 2.5e9, fc: 250e3, pmDeg: 10,
      kvco: 500e6, icp: 100e-6,
    })).toThrow();
  });
});
