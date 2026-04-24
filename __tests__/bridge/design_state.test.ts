import {
  DESIGN_SCHEMA_VERSION, toSnapshot, fromSnapshotJson, hashSnapshot,
  diffSnapshots, stableStringify,
} from '@/lib/bridge/design_state';
import type { Cell, Net, Wire } from '@/types/algorithms';

function sampleCells(): Cell[] {
  return [
    {
      id: 'u1', name: 'u1', width: 4, height: 4,
      position: { x: 10, y: 10 }, pins: [], type: 'standard',
    },
    {
      id: 'u2', name: 'u2', width: 4, height: 4,
      position: { x: 20, y: 20 }, pins: [], type: 'standard',
    },
  ];
}
function sampleNets(): Net[] {
  return [{ id: 'n1', name: 'n1', pins: ['u1.Y', 'u2.A'], weight: 1 }];
}
function sampleWires(): Wire[] { return []; }

function baseSnap() {
  return toSnapshot({
    id: 'des-1', name: 'Test',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-02T00:00:00Z',
    cells: sampleCells(), nets: sampleNets(), wires: sampleWires(),
    dieArea: { width: 100, height: 100 },
  });
}

describe('DesignSnapshot — schema', () => {
  it('toSnapshot stamps the schema version', () => {
    const s = baseSnap();
    expect(s.schemaVersion).toBe(DESIGN_SCHEMA_VERSION);
  });

  it('fromSnapshotJson parses a stringified snapshot back', () => {
    const s = baseSnap();
    const json = JSON.stringify(s);
    const parsed = fromSnapshotJson(json);
    expect(parsed.id).toBe('des-1');
    expect(parsed.cells).toHaveLength(2);
  });

  it('rejects missing schemaVersion', () => {
    expect(() => fromSnapshotJson({ id: 'x' } as any)).toThrow(/schemaVersion/);
  });

  it('rejects future schema versions', () => {
    expect(() => fromSnapshotJson({
      schemaVersion: DESIGN_SCHEMA_VERSION + 5,
      id: 'x', name: 'y',
      createdAt: 'a', updatedAt: 'b',
      cells: [], nets: [], wires: [],
    } as any)).toThrow(/newer/);
  });

  it('rejects missing required fields', () => {
    expect(() => fromSnapshotJson({
      schemaVersion: 1, name: 'x',
      createdAt: 'a', updatedAt: 'b',
      cells: [], nets: [], wires: [],
    } as any)).toThrow(/missing field/);
  });
});

describe('DesignSnapshot — hashing', () => {
  it('equal content → equal hash', () => {
    const a = baseSnap();
    const b = baseSnap();
    expect(hashSnapshot(a)).toBe(hashSnapshot(b));
  });

  it('different cells → different hash', () => {
    const a = baseSnap();
    const b = baseSnap();
    b.cells[0].position = { x: 99, y: 99 };
    expect(hashSnapshot(a)).not.toBe(hashSnapshot(b));
  });

  it('changing updatedAt alone does NOT affect the hash', () => {
    const a = baseSnap();
    const b = { ...baseSnap(), updatedAt: '2099-12-31T23:59:59Z' };
    expect(hashSnapshot(a)).toBe(hashSnapshot(b));
  });

  it('stableStringify sorts keys deterministically', () => {
    const x = stableStringify({ b: 1, a: 2, c: { z: 1, a: 0 } });
    const y = stableStringify({ a: 2, c: { a: 0, z: 1 }, b: 1 });
    expect(x).toBe(y);
    expect(x).toBe('{"a":2,"b":1,"c":{"a":0,"z":1}}');
  });
});

describe('DesignSnapshot — diff', () => {
  it('detects added / removed cells', () => {
    const a = baseSnap();
    const b = baseSnap();
    b.cells.push({
      id: 'u3', name: 'u3', width: 4, height: 4,
      position: { x: 30, y: 30 }, pins: [], type: 'standard',
    });
    b.cells.shift(); // remove u1
    const d = diffSnapshots(a, b);
    expect(d.cellsAdded).toEqual(['u3']);
    expect(d.cellsRemoved).toEqual(['u1']);
  });

  it('detects moved cells by (from, to) coordinates', () => {
    const a = baseSnap();
    const b = baseSnap();
    b.cells[0].position = { x: 50, y: 50 };
    const d = diffSnapshots(a, b);
    expect(d.cellsMoved).toHaveLength(1);
    expect(d.cellsMoved[0]).toEqual({
      id: 'u1', from: { x: 10, y: 10 }, to: { x: 50, y: 50 },
    });
  });

  it('detects changed net pin lists', () => {
    const a = baseSnap();
    const b = baseSnap();
    b.nets[0] = { ...b.nets[0], pins: ['u1.Y', 'u2.A', 'u2.B'] };
    const d = diffSnapshots(a, b);
    expect(d.netsChanged).toEqual(['n1']);
  });

  it('empty diff when snapshots are identical', () => {
    const a = baseSnap();
    const b = baseSnap();
    const d = diffSnapshots(a, b);
    expect(d).toEqual({
      cellsAdded: [], cellsRemoved: [], cellsMoved: [],
      netsAdded: [], netsRemoved: [], netsChanged: [],
    });
  });
});
