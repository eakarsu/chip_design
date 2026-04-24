import { parseDef, writeDef, defToMicrons } from '@/lib/parsers/def';

const SAMPLE = `
VERSION 5.8 ;
DIVIDERCHAR "/" ;
BUSBITCHARS "[]" ;
DESIGN top ;
UNITS DISTANCE MICRONS 1000 ;

DIEAREA ( 0 0 ) ( 100000 100000 ) ;

ROW core_row_0 core 0 0 N DO 500 BY 1 STEP 190 0 ;
ROW core_row_1 core 0 1400 FS DO 500 BY 1 STEP 190 0 ;

TRACKS Y 140 DO 100 STEP 280 LAYER metal1 metal3 ;

COMPONENTS 3 ;
  - u1 INV_X1 + PLACED ( 1000 0 ) N ;
  - u2 NAND2_X1 + FIXED ( 2000 0 ) FS ;
  - u3 DFF_X1 + UNPLACED ;
END COMPONENTS

PINS 2 ;
  - clk + NET clk + DIRECTION INPUT + USE CLOCK + LAYER metal2 ( -50 -50 ) ( 50 50 ) + PLACED ( 0 50000 ) N ;
  - out + NET out + DIRECTION OUTPUT + USE SIGNAL + PLACED ( 100000 50000 ) N ;
END PINS

NETS 2 ;
  - n1 ( u1 Y ) ( u2 A ) ;
  - clk ( PIN clk ) ( u3 CK ) + USE CLOCK ;
END NETS

SPECIALNETS 1 ;
  - VDD ( * VDD ) + USE POWER ;
END SPECIALNETS

END DESIGN
`;

describe('DEF parser — header', () => {
  it('captures VERSION / DESIGN / UNITS / DIVIDERCHAR / BUSBITCHARS', () => {
    const d = parseDef(SAMPLE);
    expect(d.version).toBe('5.8');
    expect(d.designName).toBe('top');
    expect(d.units?.dbuPerMicron).toBe(1000);
    expect(d.dividerChar).toBe('/');
    expect(d.busBitChars).toBe('[]');
  });
});

describe('DEF parser — geometry', () => {
  it('parses DIEAREA', () => {
    const d = parseDef(SAMPLE);
    expect(d.dieArea?.points).toEqual([
      { x: 0, y: 0 }, { x: 100000, y: 100000 },
    ]);
  });

  it('parses ROW with DO/STEP', () => {
    const d = parseDef(SAMPLE);
    expect(d.rows).toHaveLength(2);
    expect(d.rows[0]).toMatchObject({
      name: 'core_row_0', site: 'core', x: 0, y: 0, orient: 'N',
      numX: 500, numY: 1, stepX: 190, stepY: 0,
    });
  });

  it('parses TRACKS with layer list', () => {
    const d = parseDef(SAMPLE);
    expect(d.tracks).toHaveLength(1);
    expect(d.tracks[0].layers).toEqual(['metal1', 'metal3']);
  });
});

describe('DEF parser — COMPONENTS', () => {
  it('captures placement status / location / orient', () => {
    const d = parseDef(SAMPLE);
    expect(d.components).toHaveLength(3);
    expect(d.components[0]).toMatchObject({
      name: 'u1', macro: 'INV_X1', placement: 'PLACED', x: 1000, y: 0, orient: 'N',
    });
    expect(d.components[1]).toMatchObject({ placement: 'FIXED', orient: 'FS' });
    expect(d.components[2]).toMatchObject({ placement: 'UNPLACED' });
  });
});

describe('DEF parser — PINS', () => {
  it('captures NET / DIRECTION / USE / LAYER rect / placement', () => {
    const d = parseDef(SAMPLE);
    expect(d.pins).toHaveLength(2);
    const clk = d.pins.find(p => p.name === 'clk')!;
    expect(clk.direction).toBe('INPUT');
    expect(clk.use).toBe('CLOCK');
    expect(clk.layer).toBe('metal2');
    expect(clk.rect).toEqual({ xl: -50, yl: -50, xh: 50, yh: 50 });
    expect(clk.placement).toBe('PLACED');
    expect(clk.x).toBe(0);
    expect(clk.y).toBe(50000);
  });
});

describe('DEF parser — NETS', () => {
  it('parses ordinary NETS with multiple (comp pin) connections', () => {
    const d = parseDef(SAMPLE);
    expect(d.nets).toHaveLength(2);
    const n1 = d.nets[0];
    expect(n1.name).toBe('n1');
    expect(n1.connections).toEqual([
      { component: 'u1', pin: 'Y' },
      { component: 'u2', pin: 'A' },
    ]);
  });

  it('parses SPECIALNETS separately', () => {
    const d = parseDef(SAMPLE);
    expect(d.specialNets).toHaveLength(1);
    expect(d.specialNets[0].name).toBe('VDD');
    expect(d.specialNets[0].use).toBe('POWER');
  });

  it('captures "+ USE" inline on a NET', () => {
    const d = parseDef(SAMPLE);
    const clk = d.nets.find(n => n.name === 'clk')!;
    expect(clk.use).toBe('CLOCK');
  });
});

describe('DEF unit conversion', () => {
  it('converts DBU coordinates to microns', () => {
    const d = parseDef(SAMPLE);
    const um = defToMicrons(d);
    expect(um.dieArea?.points[1]).toEqual({ x: 100, y: 100 });
    expect(um.components[0].x).toBe(1);
  });
});

describe('DEF writer — round-trip', () => {
  it('emits DEF text that parses back to the same structure', () => {
    const original = parseDef(SAMPLE);
    const emitted = writeDef(original);
    const reparsed = parseDef(emitted);
    expect(reparsed.designName).toBe(original.designName);
    expect(reparsed.components.length).toBe(original.components.length);
    expect(reparsed.nets.length).toBe(original.nets.length);
    expect(reparsed.pins.length).toBe(original.pins.length);
    expect(reparsed.components[0]).toMatchObject({
      name: 'u1', macro: 'INV_X1', placement: 'PLACED', x: 1000, y: 0,
    });
  });

  it('skips empty sections in the output', () => {
    const minimal = writeDef({
      designName: 'empty', rows: [], tracks: [],
      components: [], pins: [], nets: [], specialNets: [], warnings: [],
    });
    expect(minimal).not.toMatch(/COMPONENTS/);
    expect(minimal).not.toMatch(/NETS/);
    expect(minimal).toMatch(/END DESIGN/);
  });
});
