import { sweepBandgap } from '@/lib/tools/bandgap';
describe('sweepBandgap', () => {
  it('finds an α with low TC', () => {
    const r = sweepBandgap({ Tmin: 233, Tmax: 398, steps: 30 });
    expect(r.alpha).toBeGreaterThan(5);
    expect(r.alpha).toBeLessThan(50);
    // Around ~1.20 V
    expect(r.Vmean).toBeGreaterThan(0.8);
    expect(r.Vmean).toBeLessThan(1.6);
    expect(r.tcPpm).toBeLessThan(500);
  });
  it('respects user-supplied alpha', () => {
    const r = sweepBandgap({ Tmin: 250, Tmax: 350, alpha: 18, steps: 20 });
    expect(r.alpha).toBe(18);
    expect(r.samples).toHaveLength(20);
  });
  it('throws on bad range', () => {
    expect(() => sweepBandgap({ Tmin: 350, Tmax: 250 })).toThrow();
  });
});
