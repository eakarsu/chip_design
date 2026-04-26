import { remapLibrary, layerHistogram, parseRemapTable } from '@/lib/tools/gds_remap';
import type { GdsLibrary } from '@/lib/gds/types';

function lib(): GdsLibrary {
  return {
    libname: 'TEST',
    version: 600,
    units: { userPerDb: 1e-3, metersPerDb: 1e-9 },
    structures: [{
      name: 'TOP',
      elements: [
        { type: 'boundary', layer: 1, datatype: 0, points: [{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1},{x:0,y:0}] },
        { type: 'boundary', layer: 1, datatype: 1, points: [{x:0,y:0},{x:2,y:0},{x:2,y:2},{x:0,y:2},{x:0,y:0}] },
        { type: 'path',     layer: 2, datatype: 0, pathtype: 0, width: 100, points: [{x:0,y:0},{x:5,y:0}] },
        { type: 'text',     layer: 9, texttype: 0, origin:{x:0,y:0}, string: 'lbl' },
        { type: 'sref',     sname: 'X', origin: { x:0, y:0 } },
      ],
    }],
  };
}

describe('layerHistogram', () => {
  it('counts (layer, datatype) pairs', () => {
    const h = layerHistogram(lib());
    expect(h).toEqual(expect.arrayContaining([
      { layer: 1, datatype: 0, count: 1 },
      { layer: 1, datatype: 1, count: 1 },
      { layer: 2, datatype: 0, count: 1 },
      { layer: 9, datatype: 0, count: 1 },
    ]));
  });
});

describe('remapLibrary', () => {
  it('renumbers layer+datatype matches', () => {
    const { lib: out, report } = remapLibrary(lib(), {
      rules: [{ fromLayer: 1, fromDatatype: 0, toLayer: 10, toDatatype: 0 }],
    });
    const els = out.structures[0].elements;
    const first = els[0] as Extract<typeof els[number], { type: 'boundary' }>;
    expect(first.layer).toBe(10);
    const second = els[1] as Extract<typeof els[number], { type: 'boundary' }>;
    expect(second.layer).toBe(1); // datatype=1 → no match
    expect(report.hits[0]).toBe(1);
    expect(report.unmapped).toBe(3); // l1/d1, l2/d0, l9/d0
  });

  it('wildcard datatype matches anything on that layer', () => {
    const { report } = remapLibrary(lib(), {
      rules: [{ fromLayer: 1, fromDatatype: '*', toLayer: 11, toDatatype: 0 }],
    });
    expect(report.hits[0]).toBe(2);
  });

  it('specific rule wins over wildcard regardless of order', () => {
    const { lib: out, report } = remapLibrary(lib(), {
      rules: [
        { fromLayer: 1, fromDatatype: '*', toLayer: 11, toDatatype: 0, label: 'wild' },
        { fromLayer: 1, fromDatatype: 1,   toLayer: 12, toDatatype: 0, label: 'spec' },
      ],
    });
    const second = out.structures[0].elements[1] as { layer: number };
    expect(second.layer).toBe(12);
    expect(report.hits[1]).toBe(1);
  });

  it('toLayer=null drops the element', () => {
    const { lib: out, report } = remapLibrary(lib(), {
      rules: [{ fromLayer: 9, fromDatatype: 0, toLayer: null }],
    });
    expect(out.structures[0].elements.find(e => e.type === 'text')).toBeUndefined();
    expect(report.dropped).toBe(1);
  });

  it('dropUnmapped removes unmatched elements', () => {
    const { lib: out, report } = remapLibrary(lib(), {
      rules: [{ fromLayer: 1, fromDatatype: 0, toLayer: 10, toDatatype: 0 }],
      dropUnmapped: true,
    });
    // Should keep just the matched boundary + the sref (layer-less, never dropped).
    expect(out.structures[0].elements).toHaveLength(2);
    expect(report.dropped).toBeGreaterThan(0);
  });

  it('preserves SREF unchanged', () => {
    const { lib: out } = remapLibrary(lib(), { rules: [] });
    expect(out.structures[0].elements.find(e => e.type === 'sref')).toBeDefined();
  });
});

describe('parseRemapTable', () => {
  it('accepts a valid config', () => {
    const t = parseRemapTable({
      rules: [
        { fromLayer: 1, fromDatatype: 0, toLayer: 10, toDatatype: 0 },
        { fromLayer: 2, fromDatatype: '*', toLayer: null },
      ],
      dropUnmapped: true,
    });
    expect(t.rules).toHaveLength(2);
    expect(t.dropUnmapped).toBe(true);
  });

  it('rejects bad rules', () => {
    expect(() => parseRemapTable({ rules: [{ fromLayer: 'x' }] })).toThrow();
    expect(() => parseRemapTable({})).toThrow();
  });
});
