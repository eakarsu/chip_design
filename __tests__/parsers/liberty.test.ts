import { parseLiberty, summariseLiberty } from '@/lib/parsers/liberty';

const SAMPLE = `
/* Trivial Liberty file */
library (sky130_fd_sc_hd) {
  technology : "cmos" ;
  delay_model : table_lookup ;
  cell (sky130_AND2_X1) {
    area : 4.32 ;
    cell_leakage_power : 1.2e-9 ;
    pin (A) {
      direction : input ;
      capacitance : 0.0023 ;
    }
    pin (B) {
      direction : input ;
      capacitance : 0.0021 ;
    }
    pin (Y) {
      direction : output ;
      function : "(A & B)" ;
      timing () { related_pin : "A" ; cell_rise (table) { values("0.1, 0.2"); } }
      timing () { related_pin : "B" ; cell_rise (table) { values("0.1, 0.2"); } }
    }
  }
  cell (sky130_DFF_X1) {
    area : 9.85 ;
    cell_leakage_power : 5e-9 ;
    pin (CLK) { direction : input ; capacitance : 0.0050 ; }
    pin (D)   { direction : input ; capacitance : 0.0030 ; }
    pin (Q)   { direction : output ;
      timing () { related_pin : "CLK" ; }
    }
  }
}
`;

describe('parseLiberty', () => {
  it('parses cells with area and leakage', () => {
    const lib = parseLiberty(SAMPLE);
    expect(lib.cells).toHaveLength(2);
    const and2 = lib.cells.find(c => c.name === 'sky130_AND2_X1')!;
    expect(and2.area).toBeCloseTo(4.32, 6);
    expect(and2.leakage).toBeCloseTo(1.2e-9, 14);
  });

  it('parses pins with direction and capacitance', () => {
    const lib = parseLiberty(SAMPLE);
    const and2 = lib.cells.find(c => c.name === 'sky130_AND2_X1')!;
    expect(and2.pins).toHaveLength(3);
    const a = and2.pins.find(p => p.name === 'A')!;
    expect(a.direction).toBe('input');
    expect(a.capacitance).toBeCloseTo(0.0023, 6);
    const y = and2.pins.find(p => p.name === 'Y')!;
    expect(y.direction).toBe('output');
    expect(y.func).toMatch(/A\s*&\s*B/);
  });

  it('counts timing arcs per cell', () => {
    const lib = parseLiberty(SAMPLE);
    expect(lib.cells.find(c => c.name === 'sky130_AND2_X1')!.totalArcs).toBe(2);
    expect(lib.cells.find(c => c.name === 'sky130_DFF_X1')!.totalArcs).toBe(1);
  });

  it('records library-level attributes', () => {
    const lib = parseLiberty(SAMPLE);
    expect(lib.name).toBe('sky130_fd_sc_hd');
    expect(lib.attributes.technology).toBe('cmos');
  });

  it('warns when nothing parses', () => {
    const lib = parseLiberty('');
    expect(lib.warnings.length).toBeGreaterThan(0);
  });
});

describe('summariseLiberty', () => {
  it('aggregates counts and statistics', () => {
    const s = summariseLiberty(parseLiberty(SAMPLE));
    expect(s.cellCount).toBe(2);
    expect(s.pinCount).toBe(6);
    expect(s.arcCount).toBe(3);
    expect(s.area?.min).toBeCloseTo(4.32, 4);
    expect(s.area?.max).toBeCloseTo(9.85, 4);
    expect(s.directions.input).toBe(4);
    expect(s.directions.output).toBe(2);
  });
});
