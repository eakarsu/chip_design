/**
 * @jest-environment node
 */
import {
  applyEcoOperations,
  checkLegality,
  EcoOperation,
} from '@/lib/algorithms/eco_flow';
import { DESIGN_SCHEMA_VERSION, type DesignSnapshot } from '@/lib/bridge/design_state';
import type { Cell, Net } from '@/types/algorithms';

function pin(id: string, dir: 'input' | 'output' | 'inout' = 'input') {
  return { id, name: id, position: { x: 0, y: 0 }, direction: dir };
}
function cell(id: string, pins = [pin(`${id}_o`, 'output'), pin(`${id}_i`, 'input')]): Cell {
  return {
    id, name: `${id}_NAND2`, width: 2, height: 1,
    position: { x: 0, y: 0 }, pins, type: 'standard',
  };
}
function net(id: string, pins: string[]): Net {
  return { id, name: id, pins, weight: 1 };
}

function fixture(): DesignSnapshot {
  // Two-cell design: A drives B via net n1.
  return {
    schemaVersion: DESIGN_SCHEMA_VERSION,
    id: 'd1', name: 'design',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    cells: [cell('A'), cell('B')],
    nets: [net('n1', ['A_o', 'B_i'])],
    wires: [],
  };
}

describe('checkLegality', () => {
  it('passes a healthy snapshot', () => {
    expect(checkLegality(fixture()).ok).toBe(true);
  });

  it('rejects duplicate cell ids', () => {
    const s = fixture();
    s.cells.push(cell('A'));
    const r = checkLegality(s);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/duplicate/);
  });

  it('rejects nets referencing unknown pins', () => {
    const s = fixture();
    s.nets[0].pins.push('ghost_pin');
    const r = checkLegality(s);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/unknown pin/);
  });

  it('rejects shorts (one pin on multiple nets)', () => {
    const s = fixture();
    s.nets.push(net('n2', ['A_o', 'B_i']));
    const r = checkLegality(s);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/multiple nets/);
  });
});

describe('applyEcoOperations — cell_swap', () => {
  it('renames + resizes a cell', () => {
    const ops: EcoOperation[] = [
      { kind: 'cell_swap', cellId: 'A', newName: 'A_NAND4', newWidth: 4 },
    ];
    const r = applyEcoOperations(fixture(), ops);
    expect(r.ok).toBe(true);
    const a = r.after.cells.find(c => c.id === 'A')!;
    expect(a.name).toBe('A_NAND4');
    expect(a.width).toBe(4);
  });

  it('rejects swap on non-existent cell', () => {
    const ops: EcoOperation[] = [
      { kind: 'cell_swap', cellId: 'ghost', newName: 'X' },
    ];
    const r = applyEcoOperations(fixture(), ops);
    expect(r.ok).toBe(false);
    expect(r.ops[0].status).toBe('rejected');
    expect(r.ops[0].message).toMatch(/not found/);
  });
});

describe('applyEcoOperations — gate_resize', () => {
  it('multiplies width by scaleFactor and tags the name', () => {
    const ops: EcoOperation[] = [
      { kind: 'gate_resize', cellId: 'B', scaleFactor: 2 },
    ];
    const r = applyEcoOperations(fixture(), ops);
    const b = r.after.cells.find(c => c.id === 'B')!;
    expect(b.width).toBe(4); // 2 * 2
    expect(b.name).toMatch(/_x2$/);
  });

  it('rejects non-positive scaleFactor', () => {
    const r = applyEcoOperations(fixture(), [
      { kind: 'gate_resize', cellId: 'A', scaleFactor: 0 },
    ]);
    expect(r.ops[0].status).toBe('rejected');
  });
});

describe('applyEcoOperations — pin_swap', () => {
  it('rewrites every net referencing the swapped pins', () => {
    // Build a cell with two input pins and a net hitting one of them.
    const c = cell('C', [pin('C_o', 'output'), pin('C_a', 'input'), pin('C_b', 'input')]);
    const snap: DesignSnapshot = {
      ...fixture(),
      cells: [...fixture().cells, c],
      nets: [
        net('n1', ['A_o', 'C_a']),
        net('n2', ['C_o', 'B_i']),
      ],
    };
    const r = applyEcoOperations(snap, [
      { kind: 'pin_swap', cellId: 'C', pinAId: 'C_a', pinBId: 'C_b' },
    ]);
    expect(r.ok).toBe(true);
    const n1 = r.after.nets.find(n => n.id === 'n1')!;
    expect(n1.pins).toEqual(['A_o', 'C_b']);
  });
});

describe('applyEcoOperations — buffer_insert', () => {
  it('splits a net into driver→buffer and buffer→sinks', () => {
    const buf: Cell = {
      id: 'BUF1', name: 'BUF', width: 1, height: 1, type: 'standard',
      position: { x: 5, y: 5 },
      pins: [pin('BUF1_i', 'input'), pin('BUF1_o', 'output')],
    };
    const r = applyEcoOperations(fixture(), [
      {
        kind: 'buffer_insert',
        netId: 'n1',
        buffer: buf,
        bufferInputPinId: 'BUF1_i',
        bufferOutputPinId: 'BUF1_o',
      },
    ]);
    expect(r.ok).toBe(true);
    expect(r.after.cells.some(c => c.id === 'BUF1')).toBe(true);
    const n1 = r.after.nets.find(n => n.id === 'n1')!;
    const newNet = r.after.nets.find(n => n.id === 'n1__bufout')!;
    expect(n1.pins.sort()).toEqual(['A_o', 'BUF1_i'].sort());
    expect(newNet.pins.sort()).toEqual(['B_i', 'BUF1_o'].sort());
  });

  it('rejects buffer with a duplicate cell id', () => {
    const buf: Cell = {
      id: 'A', // collision
      name: 'BUF', width: 1, height: 1, type: 'standard',
      position: { x: 0, y: 0 },
      pins: [pin('Ax_i', 'input'), pin('Ax_o', 'output')],
    };
    const r = applyEcoOperations(fixture(), [
      {
        kind: 'buffer_insert', netId: 'n1', buffer: buf,
        bufferInputPinId: 'Ax_i', bufferOutputPinId: 'Ax_o',
      },
    ]);
    expect(r.ops[0].status).toBe('rejected');
    expect(r.ops[0].message).toMatch(/already exists/);
  });
});

describe('applyEcoOperations — cell_move', () => {
  it('updates position and shows up in the diff', () => {
    const r = applyEcoOperations(fixture(), [
      { kind: 'cell_move', cellId: 'A', to: { x: 100, y: 200 } },
    ]);
    expect(r.ok).toBe(true);
    expect(r.after.cells.find(c => c.id === 'A')!.position).toEqual({ x: 100, y: 200 });
    expect(r.diff.cellsMoved).toHaveLength(1);
    expect(r.diff.cellsMoved[0].to).toEqual({ x: 100, y: 200 });
  });
});

describe('applyEcoOperations — atomic mode', () => {
  it('rolls everything back if any op fails when atomic=true', () => {
    const ops: EcoOperation[] = [
      { kind: 'cell_move', cellId: 'A', to: { x: 7, y: 7 } },
      { kind: 'cell_swap', cellId: 'ghost', newName: 'X' }, // fails
    ];
    const r = applyEcoOperations(fixture(), ops, { atomic: true });
    expect(r.ok).toBe(false);
    // A should NOT have moved.
    expect(r.after.cells.find(c => c.id === 'A')!.position).toEqual({ x: 0, y: 0 });
  });

  it('partial-mode: applied ops survive even if a later one fails', () => {
    const ops: EcoOperation[] = [
      { kind: 'cell_move', cellId: 'A', to: { x: 7, y: 7 } },
      { kind: 'cell_swap', cellId: 'ghost', newName: 'X' },
    ];
    const r = applyEcoOperations(fixture(), ops);
    expect(r.ok).toBe(false);
    expect(r.after.cells.find(c => c.id === 'A')!.position).toEqual({ x: 7, y: 7 });
  });
});

describe('applyEcoOperations — diff and timestamps', () => {
  it('bumps updatedAt only when changes were applied', () => {
    const before = fixture();
    const r1 = applyEcoOperations(before, []);
    expect(r1.after.updatedAt).toBe(before.updatedAt);

    const r2 = applyEcoOperations(before, [
      { kind: 'cell_move', cellId: 'A', to: { x: 1, y: 1 } },
    ]);
    expect(r2.after.updatedAt).not.toBe(before.updatedAt);
  });

  it('does not mutate the input snapshot', () => {
    const before = fixture();
    const beforeJson = JSON.stringify(before);
    applyEcoOperations(before, [
      { kind: 'cell_move', cellId: 'A', to: { x: 99, y: 99 } },
    ]);
    expect(JSON.stringify(before)).toBe(beforeJson);
  });
});
