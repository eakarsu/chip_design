import { checkEM } from '@/lib/tools/em_check';

const LAYERS = [
  { name: 'M5', thickness: 0.5, jmax: 1 }, // 1 MA/cm² = 0.01 A/μm²
];

describe('checkEM', () => {
  it('flags a strap above Jmax', () => {
    const r = checkEM(
      [{ name: 's1', layer: 'M5', width: 1, length: 100, current: 0.006 }],
      LAYERS,
    );
    // J = 0.006 / (1*0.5) = 0.012 A/μm² ; Jmax = 0.01 → ratio 1.2
    expect(r.reports[0].status).toBe('fail');
    expect(r.failing).toBe(1);
  });

  it('marks 80% as warn', () => {
    const r = checkEM(
      [{ name: 's', layer: 'M5', width: 1, length: 1, current: 0.0045 }],
      LAYERS,
    );
    // J = 0.0045 / 0.5 = 0.009 → ratio 0.9
    expect(r.reports[0].status).toBe('warn');
  });

  it('passes a strap at a small fraction of Jmax', () => {
    const r = checkEM(
      [{ name: 's', layer: 'M5', width: 1, length: 1, current: 0.0001 }],
      LAYERS,
    );
    // J = 2e-4 A/μm² → ratio 0.02
    expect(r.reports[0].status).toBe('ok');
  });

  it('warns on unknown layer', () => {
    const r = checkEM(
      [{ name: 's', layer: 'M99', width: 1, length: 1, current: 0.001 }],
      LAYERS,
    );
    expect(r.warnings.length).toBe(1);
  });

  it('throws on bad input shape', () => {
    expect(() => checkEM(null as never, LAYERS)).toThrow();
  });
});
