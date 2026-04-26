import { computeFIT } from '@/lib/tools/fit_model';

describe('computeFIT', () => {
  it('sums per-mechanism FIT contributions', () => {
    const r = computeFIT({
      useK: 358, stressK: 358,
      mechanisms: [
        { name: 'NBTI', population: 1e6, baseFit: 1e-3, Ea: 0 },
        { name: 'TDDB', population: 1e6, baseFit: 0.5e-3, Ea: 0 },
      ],
    });
    expect(r.totalFit).toBeCloseTo(1500, 6);
    const fractions = r.contributions.map(c => c.fraction);
    expect(fractions.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
  });

  it('applies Arrhenius temperature acceleration', () => {
    const cool = computeFIT({
      useK: 333, stressK: 358,
      mechanisms: [{ name: 'NBTI', population: 1e6, baseFit: 1e-3, Ea: 0.7 }],
    });
    const hot = computeFIT({
      useK: 358, stressK: 358,
      mechanisms: [{ name: 'NBTI', population: 1e6, baseFit: 1e-3, Ea: 0.7 }],
    });
    expect(cool.totalFit).toBeLessThan(hot.totalFit);
  });

  it('reports MTTF in hours and years', () => {
    const r = computeFIT({
      useK: 358, stressK: 358,
      mechanisms: [{ name: 'EM', population: 1, baseFit: 100, Ea: 0 }],
    });
    expect(r.mttfHours).toBe(1e7);
    expect(r.mttfYears).toBeCloseTo(1e7 / 8760, 3);
  });

  it('throws on bad temperature', () => {
    expect(() => computeFIT({
      useK: 0, stressK: 0, mechanisms: [],
    })).toThrow();
  });
});
