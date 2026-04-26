import { parsePowerReport, groupByCell } from '@/lib/tools/power';

const SAMPLE = `
Group                  Internal     Switching    Leakage      Total       %
--------------------------------------------------------------------------
Sequential             1.23e-3      4.56e-4      7.89e-6      1.69e-3     34.5%
Combinational          5.67e-4      8.91e-4      2.34e-5      1.48e-3     30.2%
Macro                  3.45e-3      6.78e-4      9.01e-5      4.22e-3     85.9%
--------------------------------------------------------------------------
Total                                                          7.39e-3     100.0%

inst_a cell=AND2_X1 Internal=1.2e-4 Switching=3.4e-5 Leakage=7.8e-7 Total=1.6e-4
inst_b cell=AND2_X1 Internal=2.4e-4 Switching=6.8e-5 Leakage=1.2e-6 Total=3.1e-4
inst_c cell=DFF_X1  Internal=4.4e-4 Switching=1.0e-4 Leakage=2.5e-6 Total=5.5e-4
`;

describe('parsePowerReport', () => {
  it('parses group rows', () => {
    const r = parsePowerReport(SAMPLE);
    expect(r.groups).toHaveLength(3);
    expect(r.groups[0].name).toBe('Sequential');
    expect(r.groups[0].internal).toBeCloseTo(1.23e-3, 6);
    expect(r.groups[0].percent).toBeCloseTo(0.345, 2);
  });

  it('sums totals across groups', () => {
    const r = parsePowerReport(SAMPLE);
    expect(r.totalPower).toBeCloseTo(1.69e-3 + 1.48e-3 + 4.22e-3, 5);
    expect(r.totals.internal).toBeGreaterThan(0);
  });

  it('parses per-instance lines', () => {
    const r = parsePowerReport(SAMPLE);
    expect(r.instances).toHaveLength(3);
    expect(r.instances[0].cell).toBe('AND2_X1');
    expect(r.instances[2].total).toBeCloseTo(5.5e-4, 6);
  });

  it('warns when nothing is parsed', () => {
    const r = parsePowerReport('hello');
    expect(r.warnings.length).toBeGreaterThan(0);
  });
});

describe('groupByCell', () => {
  it('aggregates per-instance results by cell', () => {
    const r = parsePowerReport(SAMPLE);
    const byCell = groupByCell(r.instances);
    expect(byCell).toHaveLength(2);
    const and2 = byCell.find(g => g.name === 'AND2_X1')!;
    expect(and2.total).toBeCloseTo(1.6e-4 + 3.1e-4, 6);
    expect(and2.percent).toBeGreaterThan(0);
  });
});
