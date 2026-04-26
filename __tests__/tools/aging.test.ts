import { projectAging } from '@/lib/tools/aging';

describe('projectAging', () => {
  it('produces a positive monotonically-growing samples array', () => {
    const r = projectAging({ alpha: 0.5, vgs: 0.8, tempK: 380, years: 10 });
    expect(r.dVth).toBeGreaterThan(0);
    for (let i = 1; i < r.samples.length; i++) {
      expect(r.samples[i].dVth).toBeGreaterThanOrEqual(r.samples[i - 1].dVth);
    }
  });

  it('zero alpha produces small drift', () => {
    const r = projectAging({ alpha: 0, vgs: 0.8, tempK: 380, years: 10 });
    expect(r.dVth).toBeLessThan(1e-2);
  });

  it('throws on bad alpha', () => {
    expect(() => projectAging({
      alpha: 2, vgs: 0.8, tempK: 380, years: 10,
    })).toThrow();
  });
});
