import { buildCellHierarchy } from '@/lib/klayout/flatten';
import type { GdsLibrary } from '@/lib/gds/types';

function rect(xl: number, yl: number, xh: number, yh: number) {
  return [
    { x: xl, y: yl }, { x: xh, y: yl },
    { x: xh, y: yh }, { x: xl, y: yh },
    { x: xl, y: yl },
  ];
}

const LIB: GdsLibrary = {
  libname: 'TEST',
  version: 600,
  units: { userPerDb: 1e-3, metersPerDb: 1e-9 },
  structures: [
    {
      name: 'TOP',
      elements: [
        { type: 'boundary', layer: 1, datatype: 0, points: rect(0, 0, 100, 100) },
        { type: 'sref', sname: 'A', origin: { x: 200, y: 0 } },
        { type: 'aref', sname: 'B', origin: { x: 0, y: 200 },
          cols: 2, rows: 3, colVector: { x: 50, y: 0 }, rowVector: { x: 0, y: 50 } },
      ],
    },
    {
      name: 'A',
      elements: [
        { type: 'boundary', layer: 2, datatype: 0, points: rect(0, 0, 10, 10) },
        { type: 'sref', sname: 'LEAF', origin: { x: 0, y: 0 } },
      ],
    },
    {
      name: 'B',
      elements: [
        { type: 'boundary', layer: 3, datatype: 0, points: rect(0, 0, 5, 5) },
      ],
    },
    {
      name: 'LEAF',
      elements: [
        { type: 'boundary', layer: 4, datatype: 0, points: rect(0, 0, 1, 1) },
      ],
    },
  ],
};

describe('buildCellHierarchy', () => {
  it('returns null for empty libraries', () => {
    expect(buildCellHierarchy({
      libname: '', version: 600,
      units: { userPerDb: 1, metersPerDb: 1 }, structures: [],
    })).toBeNull();
  });

  it('builds the SREF/AREF tree from the chosen top cell', () => {
    const root = buildCellHierarchy(LIB, 'TOP')!;
    expect(root.name).toBe('TOP');
    expect(root.children).toHaveLength(2);

    const [a, b] = root.children;
    expect(a.name).toBe('A');
    expect(a.instanceCount).toBe(1);
    expect(a.children).toHaveLength(1);
    expect(a.children[0].name).toBe('LEAF');

    expect(b.name).toBe('B');
    // AREF cols*rows = 2*3 = 6
    expect(b.instanceCount).toBe(6);
    expect(b.children).toHaveLength(0);
  });

  it('records own-shape counts at each level', () => {
    const root = buildCellHierarchy(LIB, 'TOP')!;
    // TOP has 1 boundary (the SREF/AREF don't count).
    expect(root.ownShapes).toBe(1);
    expect(root.children[0].ownShapes).toBe(1); // A's boundary
    expect(root.children[1].ownShapes).toBe(1); // B's boundary
  });

  it('marks cycles instead of recursing forever', () => {
    const cyclic: GdsLibrary = {
      libname: '', version: 600,
      units: { userPerDb: 1, metersPerDb: 1 },
      structures: [
        { name: 'X', elements: [{ type: 'sref', sname: 'Y', origin: { x: 0, y: 0 } }] },
        { name: 'Y', elements: [{ type: 'sref', sname: 'X', origin: { x: 0, y: 0 } }] },
      ],
    };
    // TOP defaults to a root, but X & Y both reference each other so neither
    // is a "root" — pickTop falls back to "largest", returning either X or Y.
    const root = buildCellHierarchy(cyclic)!;
    expect(['X', 'Y']).toContain(root.name);
    // Walking down two levels we should hit a cyclic-marked node.
    const child = root.children[0];
    expect(child.children[0]?.cyclic).toBe(true);
  });

  it('respects maxDepth', () => {
    const root = buildCellHierarchy(LIB, 'TOP', { maxDepth: 1 })!;
    // depth=0 children expand; depth=1 children should not (LEAF would be there).
    const a = root.children.find(c => c.name === 'A')!;
    expect(a.children).toHaveLength(0);
  });

  it('uses a stable path key per node', () => {
    const root = buildCellHierarchy(LIB, 'TOP')!;
    expect(root.path).toBe('TOP');
    expect(root.children[0].path).toBe('TOP/A#0');
    expect(root.children[1].path).toBe('TOP/B#1');
    expect(root.children[0].children[0].path).toBe('TOP/A#0/LEAF#0');
  });
});
