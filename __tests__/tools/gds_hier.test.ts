import { analyseHierarchy, flattenCounts } from '@/lib/tools/gds_hier';
import type { GdsLibrary } from '@/lib/gds/types';

function lib(): GdsLibrary {
  return {
    libname: 'L', version: 600,
    units: { userPerDb: 1e-3, metersPerDb: 1e-9 },
    structures: [
      {
        name: 'TOP',
        elements: [
          { type: 'sref', sname: 'BLK_A', origin: { x: 0, y: 0 } },
          { type: 'sref', sname: 'BLK_A', origin: { x: 100, y: 0 } },
          { type: 'aref', sname: 'BLK_B', origin: { x: 0, y: 0 },
            cols: 4, rows: 2,
            rowVector: { x: 0, y: 100 }, colVector: { x: 100, y: 0 } },
          { type: 'sref', sname: 'GHOST', origin: { x: 0, y: 0 } },
        ],
      },
      {
        name: 'BLK_A',
        elements: [
          { type: 'boundary', layer: 1, datatype: 0, points: [
            { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 },
            { x: 0, y: 10 }, { x: 0, y: 0 },
          ] },
          { type: 'sref', sname: 'LEAF', origin: { x: 0, y: 0 } },
        ],
      },
      {
        name: 'BLK_B',
        elements: [
          { type: 'path', layer: 2, datatype: 0, pathtype: 0, width: 100,
            points: [{ x: 0, y: 0 }, { x: 5, y: 0 }] },
        ],
      },
      {
        name: 'LEAF',
        elements: [
          { type: 'text', layer: 9, texttype: 0, origin: { x: 0, y: 0 }, string: 'L' },
        ],
      },
    ],
  };
}

describe('analyseHierarchy', () => {
  it('identifies tops correctly', () => {
    const h = analyseHierarchy(lib());
    expect(h.tops).toEqual(['TOP']);
  });

  it('flags unresolved references', () => {
    const h = analyseHierarchy(lib());
    expect(h.unresolved).toContain('GHOST');
  });

  it('counts AREF children as cols×rows', () => {
    const h = analyseHierarchy(lib());
    const top = h.cells.find(c => c.name === 'TOP')!;
    const blkB = top.children.find(c => c.name === 'BLK_B')!;
    expect(blkB.count).toBe(8);
    const blkA = top.children.find(c => c.name === 'BLK_A')!;
    expect(blkA.count).toBe(2);
  });

  it('records parents inversely', () => {
    const h = analyseHierarchy(lib());
    const leaf = h.cells.find(c => c.name === 'LEAF')!;
    expect(leaf.parents).toEqual(['BLK_A']);
  });

  it('computes per-cell stats', () => {
    const h = analyseHierarchy(lib());
    const blkA = h.cells.find(c => c.name === 'BLK_A')!;
    expect(blkA.stats.boundary).toBe(1);
    expect(blkA.stats.sref).toBe(1);
    expect(blkA.stats.bbox).toEqual({ x1: 0, y1: 0, x2: 10, y2: 10 });
    expect(blkA.stats.layers[0]).toEqual({ layer: 1, datatype: 0 });
  });
});

describe('flattenCounts', () => {
  it('multiplies child counts through the tree', () => {
    const h = analyseHierarchy(lib());
    const counts = flattenCounts(h, 'TOP');
    const leaf = counts.find(c => c.name === 'LEAF');
    // TOP→BLK_A (×2) → LEAF (×1)  ⇒  LEAF appears 2 times.
    expect(leaf?.count).toBe(2);
    const blkB = counts.find(c => c.name === 'BLK_B');
    expect(blkB?.count).toBe(8);
  });
});
