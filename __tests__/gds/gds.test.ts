import { readGds } from '@/lib/gds/reader';
import { writeGds } from '@/lib/gds/writer';
import type { GdsLibrary } from '@/lib/gds/types';

function makeLib(): GdsLibrary {
  return {
    libname: 'TEST',
    version: 600,
    units: { userPerDb: 1e-3, metersPerDb: 1e-9 },
    bgnlib: Date.UTC(2024, 0, 15, 10, 30, 0),
    modlib: Date.UTC(2024, 0, 15, 10, 30, 0),
    structures: [
      {
        name: 'TOP',
        bgnstr: Date.UTC(2024, 0, 15, 10, 30, 0),
        modstr: Date.UTC(2024, 0, 15, 10, 30, 0),
        elements: [
          {
            type: 'boundary',
            layer: 1, datatype: 0,
            points: [
              { x: 0, y: 0 }, { x: 1000, y: 0 },
              { x: 1000, y: 500 }, { x: 0, y: 500 },
              { x: 0, y: 0 },
            ],
          },
          {
            type: 'path',
            layer: 2, datatype: 0,
            pathtype: 0, width: 100,
            points: [{ x: 0, y: 250 }, { x: 1000, y: 250 }],
          },
          {
            type: 'sref',
            sname: 'CHILD',
            origin: { x: 100, y: 100 },
            transform: { mag: 2, angleDeg: 90 },
          },
          {
            type: 'aref',
            sname: 'CHILD',
            origin: { x: 0, y: 0 },
            cols: 3, rows: 2,
            colVector: { x: 200, y: 0 },
            rowVector: { x: 0, y: 300 },
          },
          {
            type: 'text',
            layer: 99, texttype: 0,
            origin: { x: 50, y: 50 },
            string: 'hello',
          },
        ],
      },
      {
        name: 'CHILD',
        elements: [{
          type: 'boundary', layer: 1, datatype: 0,
          points: [
            { x: 0, y: 0 }, { x: 50, y: 0 },
            { x: 50, y: 50 }, { x: 0, y: 50 },
            { x: 0, y: 0 },
          ],
        }],
      },
    ],
  };
}

describe('GDSII round-trip', () => {
  it('write → read preserves library structure', () => {
    const orig = makeLib();
    const bytes = writeGds(orig);
    const back = readGds(bytes, { silent: true });

    expect(back.libname).toBe('TEST');
    expect(back.version).toBe(600);
    expect(back.units.userPerDb).toBeCloseTo(1e-3, 9);
    expect(back.units.metersPerDb).toBeCloseTo(1e-9, 14);
    expect(back.structures).toHaveLength(2);
    expect(back.structures[0].name).toBe('TOP');
    expect(back.structures[0].elements).toHaveLength(5);
  });

  it('boundary points round-trip exactly', () => {
    const bytes = writeGds(makeLib());
    const back = readGds(bytes, { silent: true });
    const b = back.structures[0].elements[0];
    expect(b.type).toBe('boundary');
    if (b.type !== 'boundary') return;
    expect(b.layer).toBe(1);
    expect(b.points).toHaveLength(5);
    expect(b.points[0]).toEqual({ x: 0, y: 0 });
    expect(b.points[2]).toEqual({ x: 1000, y: 500 });
  });

  it('path width and points survive', () => {
    const bytes = writeGds(makeLib());
    const back = readGds(bytes, { silent: true });
    const p = back.structures[0].elements[1];
    expect(p.type).toBe('path');
    if (p.type !== 'path') return;
    expect(p.width).toBe(100);
    expect(p.points[1]).toEqual({ x: 1000, y: 250 });
  });

  it('SREF transform (mag, angle) decodes back', () => {
    const bytes = writeGds(makeLib());
    const back = readGds(bytes, { silent: true });
    const s = back.structures[0].elements[2];
    expect(s.type).toBe('sref');
    if (s.type !== 'sref') return;
    expect(s.sname).toBe('CHILD');
    expect(s.origin).toEqual({ x: 100, y: 100 });
    expect(s.transform?.mag).toBeCloseTo(2);
    expect(s.transform?.angleDeg).toBeCloseTo(90);
  });

  it('AREF colrow + spacing reconstruct', () => {
    const bytes = writeGds(makeLib());
    const back = readGds(bytes, { silent: true });
    const a = back.structures[0].elements[3];
    expect(a.type).toBe('aref');
    if (a.type !== 'aref') return;
    expect(a.cols).toBe(3);
    expect(a.rows).toBe(2);
    expect(a.colVector).toEqual({ x: 200, y: 0 });
    expect(a.rowVector).toEqual({ x: 0, y: 300 });
  });

  it('TEXT string survives ASCII padding', () => {
    const bytes = writeGds(makeLib());
    const back = readGds(bytes, { silent: true });
    const t = back.structures[0].elements[4];
    expect(t.type).toBe('text');
    if (t.type !== 'text') return;
    expect(t.string).toBe('hello');
  });
});

describe('GDSII REAL8 encoding', () => {
  it('encodes and decodes 1.0, 1e-3, 1e-9 within float precision', () => {
    const lib: GdsLibrary = {
      libname: 'X', version: 600,
      units: { userPerDb: 1.0, metersPerDb: 1.0 },
      structures: [{ name: 'A', elements: [] }],
    };
    const back = readGds(writeGds(lib), { silent: true });
    expect(back.units.userPerDb).toBeCloseTo(1.0, 12);

    const lib2 = { ...lib, units: { userPerDb: 0.001, metersPerDb: 1e-9 } };
    const back2 = readGds(writeGds(lib2), { silent: true });
    expect(back2.units.userPerDb).toBeCloseTo(0.001, 12);
    expect(back2.units.metersPerDb).toBeCloseTo(1e-9, 18);
  });
});
