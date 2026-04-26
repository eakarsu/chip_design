import {
  blankFloorplan, exampleFloorplan, validateFloorplan,
  generateRows, floorplanToDef, macroRect,
  type Floorplan,
} from '@/lib/algorithms/floorplan';
import { writeDef, parseDef } from '@/lib/parsers/def';

describe('floorplan — validation', () => {
  it('flags macros that escape the core', () => {
    const fp = blankFloorplan();
    fp.macros = [{ name: 'm', master: 'X', x: 900, y: 50, width: 200, height: 50, halo: 0, orient: 'N', fixed: false }];
    const issues = validateFloorplan(fp);
    expect(issues.some(i => i.severity === 'error' && /outside the core/.test(i.message))).toBe(true);
  });

  it('flags overlapping macros as errors', () => {
    const fp = blankFloorplan();
    fp.macros = [
      { name: 'a', master: 'X', x: 100, y: 100, width: 200, height: 200, halo: 0, orient: 'N', fixed: false },
      { name: 'b', master: 'X', x: 200, y: 200, width: 200, height: 200, halo: 0, orient: 'N', fixed: false },
    ];
    const issues = validateFloorplan(fp);
    expect(issues.some(i => i.severity === 'error' && /overlap/.test(i.message))).toBe(true);
  });

  it('flags halo overlap as a warning, not an error', () => {
    const fp = blankFloorplan();
    fp.macros = [
      { name: 'a', master: 'X', x: 100, y: 100, width: 100, height: 100, halo: 50, orient: 'N', fixed: false },
      { name: 'b', master: 'X', x: 250, y: 100, width: 100, height: 100, halo: 50, orient: 'N', fixed: false },
    ];
    const issues = validateFloorplan(fp);
    expect(issues.some(i => i.severity === 'warning' && /halo/.test(i.message))).toBe(true);
    expect(issues.every(i => i.severity !== 'error')).toBe(true);
  });

  it('passes a clean example design', () => {
    const fp = exampleFloorplan();
    // The example places sram_a/sram_b in the same X column with halo 5 so
    // their halos *don't* touch — issues should be empty.
    expect(validateFloorplan(fp).filter(i => i.severity === 'error')).toEqual([]);
  });
});

describe('floorplan — row generation', () => {
  it('tiles the core area on whole row heights', () => {
    const fp: Floorplan = {
      designName: 't', dbu: 1000,
      die:  { xl: 0, yl: 0, xh: 1000, yh: 1000 },
      core: { xl: 0, yl: 0, xh: 100,  yh: 30 },
      rows: [], macros: [],
    };
    const rows = generateRows(fp, { site: 'CORE', siteWidth: 1, rowHeight: 10 });
    expect(rows).toHaveLength(3);
    expect(rows[0].orient).toBe('N');
    expect(rows[1].orient).toBe('FS');
    expect(rows[0].numX).toBe(100);
  });
});

describe('floorplan — DEF emission', () => {
  it('round-trips through the DEF writer + parser', () => {
    const fp = exampleFloorplan();
    fp.rows = generateRows(fp, { site: 'core', siteWidth: 1, rowHeight: 10 });
    const def = floorplanToDef(fp);
    const text = writeDef(def);
    const parsed = parseDef(text);
    expect(parsed.designName).toBe('demo_chip');
    expect(parsed.components).toHaveLength(fp.macros.length);
    const cpu = parsed.components.find(c => c.name === 'cpu')!;
    expect(cpu.placement).toBe('FIXED');
    expect(cpu.x).toBe(100 * fp.dbu);
    expect(parsed.rows.length).toBeGreaterThan(0);
    expect(parsed.dieArea?.points).toHaveLength(2);
  });
});

describe('floorplan — geometry helpers', () => {
  it('macroRect returns the placed footprint', () => {
    const r = macroRect({ name: '', master: '', x: 5, y: 7, width: 10, height: 20, halo: 0, orient: 'N', fixed: false });
    expect(r).toEqual({ xl: 5, yl: 7, xh: 15, yh: 27 });
  });
});
