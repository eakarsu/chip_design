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
    // PM should be near target
    expect(Math.abs(r.pmActualDeg - 60)).toBeLessThan(25);
  });
  it('throws on bad PM', () => {
    expect(() => calcPllFilter({
      fref: 25e6, fvco: 2.5e9, fc: 250e3, pmDeg: 10,
      kvco: 500e6, icp: 100e-6,
    })).toThrow();
  });
});
