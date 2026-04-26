/**
 * @jest-environment node
 */
import { runOpenROAD, parseMetrics, parseTimingPaths, stepsToTcl } from '@/lib/tools/openroad';
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

describe('OpenROAD wrapper — extended metric parser', () => {
  it('parses CTS, design-area, pin placement and timing-repair stdout', () => {
    const stdout = `
[INFO TCTS-0001] Number of sinks : 42
[INFO TCTS-0024] Number of buffers inserted: 17
[INFO TCTS-0030] Maximum clock skew : 0.085
[INFO TCTS-0031] Average clock latency : 0.412

repair_timing
Inserted 9 buffers
Resized 23 instances
Repaired 7 setup violations

report_design_area
Design area 12345.67 u^2 78.4% utilization.

place_pins
Number of pins placed: 16
`;
    const m = parseMetrics(stdout);
    expect(m.cts_sinks).toBe(42);
    expect(m.cts_buffers_inserted).toBe(17);
    expect(m.cts_clock_skew).toBeCloseTo(0.085);
    expect(m.cts_clock_latency).toBeCloseTo(0.412);

    expect(m.repair_buffers).toBe(9);
    expect(m.repair_resized).toBe(23);
    expect(m.repair_violations).toBe(7);

    expect(m.design_area).toBeCloseTo(12345.67);
    expect(m.utilization).toBeCloseTo(78.4);

    expect(m.pins_placed).toBe(16);
  });
});

describe('OpenROAD wrapper — TCL emitter', () => {
  it('emits clock_tree_synthesis with optional flags', () => {
    const tcl = stepsToTcl([
      { kind: 'clock_tree_synthesis', bufferList: ['BUF_X1', 'BUF_X2'], rootBuffer: 'BUF_X4', clockNet: 'clk' },
    ]);
    expect(tcl).toContain('clock_tree_synthesis');
    expect(tcl).toContain('-buf_list {BUF_X1 BUF_X2}');
    expect(tcl).toContain('-root_buf BUF_X4');
    expect(tcl).toContain('-clk_nets {clk}');
  });

  it('emits both setup and hold passes when repair_timing mode=both', () => {
    const tcl = stepsToTcl([
      { kind: 'repair_timing', mode: 'both', slackMargin: 0.05 },
    ]);
    expect(tcl).toMatch(/repair_timing\s+-setup\s+-slack_margin 0.05/);
    expect(tcl).toMatch(/repair_timing\s+-hold\s+-slack_margin 0.05/);
  });

  it('emits report_checks / report_design_area / pin_placement / add_global_connection', () => {
    const tcl = stepsToTcl([
      { kind: 'report_checks', pathCount: 10, pathDelay: 'max' },
      { kind: 'report_design_area' },
      { kind: 'pin_placement', horLayers: ['M3', 'M5'], verLayers: ['M2', 'M4'] },
      { kind: 'add_global_connection', net: 'VDD', pinPattern: '^VDD$', power: true },
    ]);
    expect(tcl).toContain('report_checks -path_count 10 -path_delay max');
    expect(tcl).toContain('report_design_area');
    expect(tcl).toContain('place_pins -hor_layers {M3 M5} -ver_layers {M2 M4}');
    expect(tcl).toMatch(/add_global_connection -net VDD -pin_pattern "\^VDD\$"\s+-power/);
  });

  it('always terminates the script with `exit`', () => {
    const tcl = stepsToTcl([{ kind: 'report_design_area' }]);
    expect(tcl.trim().endsWith('exit')).toBe(true);
  });
});

describe('OpenROAD wrapper — full RTL-to-GDS flow steps', () => {
  it('emits initialize_floorplan with utilization and explicit die area', () => {
    const tcl = stepsToTcl([
      { kind: 'initialize_floorplan', utilization: 0.7, aspectRatio: 1, coreSpace: 2, site: 'FreePDK45' },
    ]);
    expect(tcl).toMatch(/initialize_floorplan -utilization 0.7 -aspect_ratio 1 -core_space 2 -site FreePDK45/);

    const tcl2 = stepsToTcl([
      { kind: 'initialize_floorplan', dieArea: [0, 0, 500, 500] },
    ]);
    expect(tcl2).toContain('-die_area "0 0 500 500"');
  });

  it('emits tapcell, pdngen, macro_placement, repair_design', () => {
    const tcl = stepsToTcl([
      { kind: 'tapcell', distance: 14, tapcellMaster: 'TAPCELL_X1', endcapMaster: 'ENDCAP_X1' },
      { kind: 'pdngen', configFile: 'pdn.cfg' },
      { kind: 'macro_placement', halo: [5, 5], channel: [10, 10] },
      { kind: 'repair_design', maxWireLength: 600, slewMargin: 10 },
    ]);
    expect(tcl).toContain('tapcell -distance 14 -tapcell_master TAPCELL_X1 -endcap_master ENDCAP_X1');
    expect(tcl).toContain('pdngen "pdn.cfg"');
    expect(tcl).toContain('macro_placement -halo {5 5} -channel {10 10}');
    expect(tcl).toContain('repair_design -max_wire_length 600 -slew_margin 10');
  });

  it('emits antenna check/repair, write_gds, report_clock_skew', () => {
    const tcl = stepsToTcl([
      { kind: 'check_antennas', reportFile: 'ant.rpt' },
      { kind: 'repair_antennas', iterations: 5, ratioMargin: 0.1 },
      { kind: 'write_gds', path: '/tmp/out.gds' },
      { kind: 'report_clock_skew' },
    ]);
    expect(tcl).toContain('check_antennas -report_file "ant.rpt"');
    expect(tcl).toContain('repair_antennas -iterations 5 -ratio_margin 0.1');
    expect(tcl).toContain('write_gds "/tmp/out.gds"');
    expect(tcl).toContain('report_clock_skew');
  });

  it('parses floorplan/PDN/tapcell/macro/antenna metrics from stdout', () => {
    const stdout = `
initialize_floorplan
Die area: 1000.00
Core area: 980.00

pdngen
Number of stripes: 8
Inserted 240 power vias

tapcell
Inserted 64 tapcells
Inserted 4 endcaps

macro_placement
Placed 6 macros

repair_design
Inserted 12 buffers
Resized 30 instances
Removed 3 buffers

check_antennas
Found 5 antenna violations

repair_antennas
Repaired 5 antenna violations

report_clock_skew
Worst clock skew: 0.073
`;
    const m = parseMetrics(stdout);
    expect(m.die_width).toBeCloseTo(1000);
    expect(m.core_width).toBeCloseTo(980);
    expect(m.pdn_stripes).toBe(8);
    expect(m.pdn_vias).toBe(240);
    expect(m.tapcells_inserted).toBe(64);
    expect(m.endcaps_inserted).toBe(4);
    expect(m.macros_placed).toBe(6);
    expect(m.repair_buffers).toBe(12);
    expect(m.repair_resized).toBe(30);
    expect(m.repair_design_removed).toBe(3);
    expect(m.antenna_violations).toBe(5);
    expect(m.antenna_repaired).toBe(5);
    expect(m.clock_skew_max).toBeCloseTo(0.073);
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

describe('OpenROAD wrapper — timing-path parser', () => {
  const SAMPLE = `
Startpoint: reg1/CK (rising edge-triggered flip-flop clocked by clk)
Endpoint: reg2/D (rising edge-triggered flip-flop clocked by clk)
Path Group: clk
Path Type: max

   Delay    Time   Description
---------------------------------------------------------
   0.00    0.00   clock clk (rise edge)
   0.00    0.00   clock network delay (ideal)
   0.00    0.00 ^ reg1/CK (DFF_X1)
   0.05    0.05 v reg1/Q (DFF_X1)
   0.20    0.25 v u_and/Z (AND2_X1)
   0.30    0.55   data arrival time

   1.00    1.00   clock clk (rise edge)
   0.00    1.00   clock network delay (ideal)
  -0.05    0.95   clock uncertainty
   0.95    0.95   data required time
---------------------------------------------------------
   0.95    0.95   data required time
  -0.55   -0.55   data arrival time
---------------------------------------------------------
   0.40    0.40   slack (MET)


Startpoint: regA/CK (rising edge-triggered flip-flop clocked by clk)
Endpoint: regB/D (rising edge-triggered flip-flop clocked by clk)
Path Group: clk
Path Type: max
   0.10    0.10 ^ regA/CK (DFF_X1)
   0.80    0.90   data arrival time
   0.50    0.50   data required time
---------------------------------
  -0.40   -0.40   slack (VIOLATED)
`;

  it('parses Startpoint / Endpoint / arrival / required / slack / status', () => {
    const paths = parseTimingPaths(SAMPLE);
    expect(paths).toHaveLength(2);
    expect(paths[0].startpoint).toBe('reg1/CK');
    expect(paths[0].endpoint).toBe('reg2/D');
    expect(paths[0].pathGroup).toBe('clk');
    expect(paths[0].pathType).toBe('max');
    expect(paths[0].arrival).toBeCloseTo(0.55);
    expect(paths[0].required).toBeCloseTo(0.95);
    expect(paths[0].slack).toBeCloseTo(0.40);
    expect(paths[0].status).toBe('MET');
    expect(paths[0].stages.length).toBeGreaterThanOrEqual(3);
  });

  it('flags negative-slack paths as VIOLATED', () => {
    const paths = parseTimingPaths(SAMPLE);
    expect(paths[1].status).toBe('VIOLATED');
    expect(paths[1].slack).toBeCloseTo(-0.40);
  });

  it('returns [] for stdout with no Startpoint blocks', () => {
    expect(parseTimingPaths('Hello world')).toEqual([]);
  });
});
