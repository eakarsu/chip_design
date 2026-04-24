/**
 * @jest-environment node
 */
import { runOpenROAD, parseMetrics } from '@/lib/tools/openroad';
import { runYosysSynth } from '@/lib/tools/yosys';

describe('OpenROAD wrapper — metric parser', () => {
  it('extracts HPWL / WNS / TNS / power / instances / nets', () => {
    const stdout = `
  Reading design...
  Number of instances : 1234
  Number of nets : 789
  HPWL : 5.432e+05
  Worst Negative Slack : -0.12
  Total Negative Slack : -3.4
  Total Power = 0.042 W
  Overflow : 0.05
`;
    const m = parseMetrics(stdout);
    expect(m.instances).toBe(1234);
    expect(m.nets).toBe(789);
    expect(m.hpwl).toBeCloseTo(543200, 0);
    expect(m.wns).toBeCloseTo(-0.12);
    expect(m.tns).toBeCloseTo(-3.4);
    expect(m.total_power).toBeCloseTo(0.042);
    expect(m.overflow).toBeCloseTo(0.05);
  });

  it('missing metrics are simply absent (no NaN)', () => {
    const m = parseMetrics('HPWL : 1234');
    expect(m.hpwl).toBe(1234);
    expect('wns' in m).toBe(false);
  });
});

describe('OpenROAD wrapper — fallback behaviour', () => {
  it('returns ranReal=false when forced to fallback with no inputs', async () => {
    const res = await runOpenROAD({ forceFallback: true });
    expect(res.ranReal).toBe(false);
    expect(res.exitCode).toBeNull();
  });

  it('runs the internal placer when DEF+LEF are provided and step is global_placement', async () => {
    const lef = `
      SITE core CLASS CORE ; SIZE 0.2 BY 1.4 ; SYMMETRY Y ; END core
      MACRO INV
        CLASS CORE ; SIZE 0.38 BY 1.4 ; SITE core ;
      END INV
    `;
    const def = `
      VERSION 5.8 ;
      DESIGN top ;
      UNITS DISTANCE MICRONS 1000 ;
      DIEAREA ( 0 0 ) ( 10000 10000 ) ;
      COMPONENTS 3 ;
        - u1 INV + PLACED ( 0 0 ) N ;
        - u2 INV + PLACED ( 0 0 ) N ;
        - u3 INV + PLACED ( 0 0 ) N ;
      END COMPONENTS
      NETS 1 ;
        - n1 ( u1 Y ) ( u2 A ) ( u3 A ) ;
      END NETS
      END DESIGN
    `;
    const res = await runOpenROAD({
      lefContent: lef, defContent: def, forceFallback: true,
      steps: [
        { kind: 'read_lef', path: '' },
        { kind: 'read_def', path: '' },
        { kind: 'global_placement', density: 0.7 },
      ],
    });
    expect(res.ranReal).toBe(false);
    expect(res.placedCells).toHaveLength(3);
    expect(res.metrics.instances).toBe(3);
    expect(res.metrics.nets).toBe(1);
    // HPWL should be finite and non-negative.
    expect(res.metrics.hpwl).toBeGreaterThanOrEqual(0);
  });
});

describe('Yosys wrapper — fallback synthesis', () => {
  it('counts primitive gates and user instances from Verilog', async () => {
    const v = `
      module top(a, b, y);
        input a, b;
        output y;
        wire t;
        and g1 (t, a, b);
        INV  g2 (.A(t), .Y(y));
      endmodule
    `;
    const r = await runYosysSynth({ verilog: v, top: 'top', forceFallback: true });
    expect(r.ranReal).toBe(false);
    expect(r.cellCount).toBe(2);
    expect(r.cells['and']).toBe(1);
    expect(r.cells['INV']).toBe(1);
  });

  it('returns cellCount=0 on malformed Verilog, but does not throw', async () => {
    const r = await runYosysSynth({
      verilog: 'this is not verilog at all',
      top: 'top', forceFallback: true,
    });
    expect(r.cellCount).toBe(0);
    expect(r.ranReal).toBe(false);
  });
});
