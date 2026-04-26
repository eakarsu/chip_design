import { parseIRReport, rasteriseIR, irColor } from '@/lib/tools/irdrop';

const SAMPLE = `
Instance         Layer    Voltage   IR_drop
inst_1/VDD       metal4   0.8950    0.0050   100  100
inst_2/VDD       metal4   0.8910    0.0090   200  100
inst_3/VDD       metal4   0.8800    0.0200   300  300
inst_4/VDD       metal4   0.8700    0.0300   100  300

Net VDD: max IR drop = 0.0300 V at inst_4/VDD, mean = 0.0160 V
Net VSS: max IR drop = 0.0150 V, mean = 0.0070 V
`;

describe('parseIRReport', () => {
  it('parses per-instance rows with optional coords', () => {
    const r = parseIRReport(SAMPLE);
    expect(r.instances).toHaveLength(4);
    expect(r.instances[0].instance).toBe('inst_1/VDD');
    expect(r.instances[0].x).toBe(100);
    expect(r.worstDrop).toBeCloseTo(0.03, 5);
    expect(r.meanDrop).toBeCloseTo((0.005 + 0.009 + 0.020 + 0.030) / 4, 5);
  });

  it('parses per-net summary lines', () => {
    const r = parseIRReport(SAMPLE);
    expect(r.nets).toHaveLength(2);
    expect(r.nets[0].net).toBe('VDD');
    expect(r.nets[0].maxDrop).toBeCloseTo(0.03, 5);
    expect(r.nets[0].worstInstance).toBe('inst_4/VDD');
    expect(r.nets[0].meanDrop).toBeCloseTo(0.016, 5);
  });

  it('warns when nothing is recognised', () => {
    const r = parseIRReport('hello world');
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it('rasterises instances onto a grid', () => {
    const r = parseIRReport(SAMPLE);
    const g = rasteriseIR(r.instances, 2, 2)!;
    expect(g.cols).toBe(2);
    expect(g.rows).toBe(2);
    // Worst drop in any cell = 0.03 (corner)
    let max = 0;
    for (const row of g.drop) for (const v of row) if (v > max) max = v;
    expect(max).toBeCloseTo(0.03, 5);
  });

  it('returns null when no instances have coords', () => {
    const r = parseIRReport(`inst_a   metal4   0.9   0.01`);
    const g = rasteriseIR(r.instances, 4, 4);
    expect(g).toBeNull();
  });

  it('irColor returns rgb string', () => {
    expect(irColor(0)).toMatch(/^rgb\(/);
    expect(irColor(1)).toMatch(/^rgb\(/);
  });
});
