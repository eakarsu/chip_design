/**
 * @jest-environment node
 */
import { parseDefToEngine, defToEngine } from '@/lib/io/def_bridge';

const SAMPLE = `VERSION 5.8 ;
DESIGN tiny ;
UNITS DISTANCE MICRONS 1000 ;
DIEAREA ( 0 0 ) ( 100000 100000 ) ;
COMPONENTS 2 ;
  - u0 AND2 + PLACED ( 1000 1000 ) N ;
  - u1 BUF  + PLACED ( 5000 1000 ) N ;
END COMPONENTS
PINS 2 ;
  - in1 + NET in1 + DIRECTION INPUT  + USE SIGNAL ;
  - out + NET y   + DIRECTION OUTPUT + USE SIGNAL ;
END PINS
NETS 2 ;
  - n0 ( PIN in1 ) ( u0 A ) ;
  - y  ( u1 Y ) ( PIN out ) ;
END NETS
END DESIGN
`;

describe('DEF → engine bridge', () => {
  test('produces cells, nets, and io ports', () => {
    const r = parseDefToEngine(SAMPLE);
    expect(r.designName).toBe('tiny');
    // 2 components + 2 io cells.
    expect(r.cells).toHaveLength(4);
    expect(r.ioCount).toBe(2);
    expect(r.nets).toHaveLength(2);
  });

  test('component positions are converted to microns', () => {
    const r = parseDefToEngine(SAMPLE);
    const u0 = r.cells.find(c => c.id === 'u0')!;
    expect(u0.position).toEqual({ x: 1, y: 1 }); // 1000 DBU / 1000 DBU per micron
  });

  test('net pin ids follow comp/pin convention', () => {
    const r = parseDefToEngine(SAMPLE);
    const n0 = r.nets.find(n => n.id === 'n0')!;
    expect(n0.pins).toEqual(expect.arrayContaining(['io_in1/PAD', 'u0/A']));
  });

  test('die area is computed from DIEAREA', () => {
    const r = parseDefToEngine(SAMPLE);
    expect(r.die).toEqual({ width: 100, height: 100 });
  });

  test('defToEngine accepts pre-parsed input', () => {
    // Just confirm the split helper exists and works.
    const { parseDef } = require('@/lib/parsers/def');
    const def = parseDef(SAMPLE);
    const r = defToEngine(def);
    expect(r.cells.length).toBe(4);
  });
});
