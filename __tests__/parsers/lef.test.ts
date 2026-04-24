import { parseLef, getMacro } from '@/lib/parsers/lef';

describe('LEF parser — library header', () => {
  it('parses VERSION / UNITS / MANUFACTURINGGRID / BUSBITCHARS / DIVIDERCHAR', () => {
    const lef = `
      VERSION 5.8 ;
      BUSBITCHARS "[]" ;
      DIVIDERCHAR "/" ;
      UNITS
        DATABASE MICRONS 1000 ;
      END UNITS
      MANUFACTURINGGRID 0.005 ;
      END LIBRARY
    `;
    const r = parseLef(lef);
    expect(r.version).toBe('5.8');
    expect(r.busBitChars).toBe('[]');
    expect(r.dividerChar).toBe('/');
    expect(r.unitsDbuPerMicron).toBe(1000);
    expect(r.manufacturingGrid).toBe(0.005);
  });
});

describe('LEF parser — SITE', () => {
  it('extracts site SIZE and SYMMETRY', () => {
    const r = parseLef(`
      SITE core
        CLASS CORE ;
        SIZE 0.19 BY 1.4 ;
        SYMMETRY Y ;
      END core
    `);
    expect(r.sites).toHaveLength(1);
    expect(r.sites[0]).toMatchObject({
      name: 'core', class: 'CORE', width: 0.19, height: 1.4,
    });
    expect(r.sites[0].symmetry).toEqual(['Y']);
  });
});

describe('LEF parser — LAYER', () => {
  it('classifies ROUTING vs CUT and captures direction/pitch/width/spacing', () => {
    const r = parseLef(`
      LAYER metal1
        TYPE ROUTING ;
        DIRECTION HORIZONTAL ;
        PITCH 0.14 ;
        WIDTH 0.07 ;
        SPACING 0.07 ;
      END metal1
      LAYER via1
        TYPE CUT ;
      END via1
    `);
    expect(r.layers).toHaveLength(2);
    expect(r.layers[0]).toMatchObject({
      name: 'metal1', type: 'ROUTING', direction: 'HORIZONTAL',
      pitch: 0.14, width: 0.07, spacing: 0.07,
    });
    expect(r.layers[1]).toMatchObject({ name: 'via1', type: 'CUT' });
  });
});

describe('LEF parser — MACRO', () => {
  const inv = `
    MACRO INV_X1
      CLASS CORE ;
      ORIGIN 0 0 ;
      SIZE 0.38 BY 1.4 ;
      SYMMETRY X Y ;
      SITE core ;
      PIN A
        DIRECTION INPUT ;
        USE SIGNAL ;
        PORT
          LAYER metal1 ;
          RECT 0.05 0.05 0.10 0.10 ;
        END
      END A
      PIN Y
        DIRECTION OUTPUT ;
        USE SIGNAL ;
        PORT
          LAYER metal1 ;
          RECT 0.28 0.65 0.34 0.75 ;
          RECT 0.30 0.10 0.36 0.20 ;
        END
      END Y
      PIN VDD
        DIRECTION INOUT ;
        USE POWER ;
        PORT
          LAYER metal1 ;
          RECT 0 1.33 0.38 1.40 ;
        END
      END VDD
      OBS
        LAYER metal1 ;
        RECT 0.14 0.18 0.22 0.40 ;
        LAYER metal2 ;
        RECT 0.05 0.80 0.30 0.90 ;
      END
    END INV_X1
  `;

  it('captures SIZE / ORIGIN / CLASS / SITE', () => {
    const r = parseLef(inv);
    const m = getMacro(r, 'INV_X1')!;
    expect(m).toBeDefined();
    expect(m.class).toBe('CORE');
    expect(m.size).toEqual({ width: 0.38, height: 1.4 });
    expect(m.site).toBe('core');
    expect(m.symmetry).toEqual(['X', 'Y']);
  });

  it('captures every PIN with direction and port rects', () => {
    const r = parseLef(inv);
    const m = getMacro(r, 'INV_X1')!;
    expect(m.pins.map(p => p.name)).toEqual(['A', 'Y', 'VDD']);
    const y = m.pins.find(p => p.name === 'Y')!;
    expect(y.direction).toBe('OUTPUT');
    expect(y.ports[0].rects).toHaveLength(2);
    const vdd = m.pins.find(p => p.name === 'VDD')!;
    expect(vdd.use).toBe('POWER');
  });

  it('captures OBS grouped by layer', () => {
    const r = parseLef(inv);
    const m = getMacro(r, 'INV_X1')!;
    expect(m.obstructions).toHaveLength(2);
    expect(m.obstructions[0].layer).toBe('metal1');
    expect(m.obstructions[0].rects).toHaveLength(1);
    expect(m.obstructions[1].layer).toBe('metal2');
  });
});

describe('LEF parser — robustness', () => {
  it('skips unknown blocks without crashing', () => {
    const r = parseLef(`
      PROPERTYDEFINITIONS
        LAYER metal1 REAL foo 0.0 ;
      END PROPERTYDEFINITIONS
      MACRO M
        SIZE 1 BY 1 ;
      END M
    `);
    expect(r.macros.map(m => m.name)).toEqual(['M']);
  });

  it('ignores # comments', () => {
    const r = parseLef(`
      # this is a comment
      MACRO M  # trailing comment
        SIZE 2 BY 3 ;   # size comment
      END M
    `);
    expect(r.macros[0].size).toEqual({ width: 2, height: 3 });
  });

  it('handles multiple macros in sequence', () => {
    const r = parseLef(`
      MACRO A SIZE 1 BY 1 ; END A
      MACRO B SIZE 2 BY 2 ; END B
      MACRO C SIZE 3 BY 3 ; END C
    `);
    expect(r.macros).toHaveLength(3);
    expect(r.macros.map(m => m.name)).toEqual(['A', 'B', 'C']);
  });
});
