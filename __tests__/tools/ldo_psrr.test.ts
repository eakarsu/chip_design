import { estimateLdoPsrr } from '@/lib/tools/ldo_psrr';
describe('estimateLdoPsrr', () => {
  it('PSRR rolls off with frequency', () => {
    const r = estimateLdoPsrr({
      A0: 1000, fp1: 100, esr: 0.05, cout: 1e-6,
      beta: 0.5, gmp: 1e-3, iload: 0.05,
    });
    expect(r.dcDb).toBeGreaterThan(r.samples[r.samples.length - 1].psrrDb);
    expect(r.fAtTarget).toBeGreaterThan(0);
    expect(r.fEsrZero).toBeGreaterThan(0);
  });
  it('throws on bad input', () => {
    expect(() => estimateLdoPsrr({
      A0: -1, fp1: 100, esr: 0.05, cout: 1e-6,
      beta: 0.5, gmp: 1e-3, iload: 0.05,
    })).toThrow();
  });
});
