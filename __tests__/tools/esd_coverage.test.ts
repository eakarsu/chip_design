import { checkEsdCoverage } from '@/lib/tools/esd_coverage';

describe('checkEsdCoverage', () => {
  it('passes pads within maxDist', () => {
    const r = checkEsdCoverage(
      [{ name: 'p', domain: 'vdd', x: 0, y: 0 }],
      [{ name: 'd', domain: 'vdd', x: 10, y: 0 }],
      20,
    );
    expect(r.reports[0].ok).toBe(true);
    expect(r.reports[0].distance).toBe(10);
    expect(r.uncovered).toBe(0);
  });

  it('flags pads beyond maxDist', () => {
    const r = checkEsdCoverage(
      [{ name: 'p', domain: 'vdd', x: 0, y: 0 }],
      [{ name: 'd', domain: 'vdd', x: 100, y: 0 }],
      20,
    );
    expect(r.reports[0].ok).toBe(false);
    expect(r.uncovered).toBe(1);
  });

  it('warns when domain has no devices', () => {
    const r = checkEsdCoverage(
      [{ name: 'p', domain: 'vdda', x: 0, y: 0 }],
      [{ name: 'd', domain: 'vdd', x: 0, y: 0 }],
      20,
    );
    expect(r.warnings.length).toBe(1);
    expect(r.reports[0].ok).toBe(false);
  });

  it('throws on bad maxDist', () => {
    expect(() => checkEsdCoverage([], [], 0)).toThrow();
  });
});
