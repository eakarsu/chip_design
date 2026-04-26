import { parseAntennaReport } from '@/lib/tools/antennas';

const A = `
[INFO ANT-0001] Found 2 antenna violations.
Net: clk
  Layer met1  PAR: 350.0 / 400.0  [PASS]
  Layer met2  PAR: 850.0 / 400.0  [FAIL]
Net: data[0]
  Layer met1  PAR: 200.0 / 400.0  [PASS]
Antenna violation: rst
  Layer met3  PAR: 1500.0 / 400.0  [FAIL]
`;

const B = `
Net: n1
  met1  PAR: 850.0 ratio  CAR: 1200.0 ratio  [VIOLATED]
  met2  PAR: 100.0 ratio  CAR: 200.0 ratio
Net: n2
  met1  PAR: 50.0 ratio
`;

describe('parseAntennaReport', () => {
  it('parses Layer X PAR: a / b style with PASS/FAIL tags', () => {
    const r = parseAntennaReport(A);
    expect(r.totalNets).toBe(3);
    expect(r.violatedNets).toBe(2);
    const clk = r.nets.find(n => n.net === 'clk')!;
    expect(clk.violated).toBe(true);
    expect(clk.layers).toHaveLength(2);
    expect(clk.layers[0].par).toBeCloseTo(350);
    expect(clk.layers[0].parLimit).toBeCloseTo(400);
    expect(clk.layers[0].violated).toBe(false);
    expect(clk.layers[1].violated).toBe(true);
    expect(clk.worstRatio).toBeCloseTo(850);
  });

  it('parses "<layer> PAR: x ratio CAR: y ratio" shape', () => {
    const r = parseAntennaReport(B);
    const n1 = r.nets.find(n => n.net === 'n1')!;
    expect(n1.layers).toHaveLength(2);
    expect(n1.layers[0].par).toBeCloseTo(850);
    expect(n1.layers[0].car).toBeCloseTo(1200);
    expect(n1.layers[0].violated).toBe(true);
    expect(n1.violated).toBe(true);
    const n2 = r.nets.find(n => n.net === 'n2')!;
    expect(n2.violated).toBe(false);
  });

  it('handles "Antenna violation:" header form', () => {
    const r = parseAntennaReport(A);
    expect(r.nets.find(n => n.net === 'rst')?.violated).toBe(true);
  });

  it('returns empty arrays for empty input', () => {
    const r = parseAntennaReport('');
    expect(r.nets).toHaveLength(0);
    expect(r.totalNets).toBe(0);
    expect(r.violatedNets).toBe(0);
  });

  it('infers violation from numeric overshoot when no PASS/FAIL tag is present', () => {
    const r = parseAntennaReport(`
Net: foo
  Layer met1  PAR: 500.0 / 400.0
`);
    const foo = r.nets.find(n => n.net === 'foo')!;
    expect(foo.layers[0].violated).toBe(true);
  });
});
