/**
 * @jest-environment node
 */
import {
  parseNodes, parseNets, parsePl, parseBookshelfBundle,
} from '@/lib/io/bookshelf';

describe('Bookshelf parser', () => {
  test('parseNodes reads cells and terminal flag', () => {
    const text = `UCLA nodes 1.0
NumNodes : 3
NumTerminals : 1
  c0  20  20
  c1  40  20
  pad0  10  10  terminal
`;
    const r = parseNodes(text);
    expect(r).toHaveLength(3);
    expect(r.find(n => n.id === 'pad0')!.terminal).toBe(true);
    expect(r.find(n => n.id === 'c1')!.width).toBe(40);
  });

  test('parseNets reads NetDegree blocks', () => {
    const text = `UCLA nets 1.0
NumNets : 1
NumPins : 2
NetDegree : 2 net_a
  c0 O : 10 5
  c1 I : 0 5
`;
    const r = parseNets(text);
    expect(r).toHaveLength(1);
    expect(r[0].id).toBe('net_a');
    expect(r[0].pins).toHaveLength(2);
    expect(r[0].pins[0].pinName).toBe('O');
    expect(r[0].pins[0].offsetX).toBe(10);
    expect(r[0].pins[1].pinName).toBe('I');
  });

  test('parsePl reads coordinates and FIXED flag', () => {
    const text = `UCLA pl 1.0
  c0  100  200  : N
  pad0  0  0  : N /FIXED
`;
    const r = parsePl(text);
    expect(r.get('c0')!.x).toBe(100);
    expect(r.get('c0')!.fixed).toBe(false);
    expect(r.get('pad0')!.fixed).toBe(true);
  });

  test('parseBookshelfBundle assembles cells + nets', () => {
    const nodes = `UCLA nodes 1.0
  c0 20 20
  c1 20 20
  pad0 10 10 terminal
`;
    const nets = `UCLA nets 1.0
NetDegree : 2 n_x
  c0 O : 10 5
  c1 I : 0 5
NetDegree : 2 n_y
  pad0 O
  c1 I
`;
    const pl = `UCLA pl 1.0
  c0 0 0
  c1 30 0
`;
    const d = parseBookshelfBundle({ nodes, nets, pl });
    expect(d.cells).toHaveLength(3);
    expect(d.nets).toHaveLength(2);
    expect(d.terminalCount).toBe(1);
    const padCell = d.cells.find(c => c.id === 'pad0')!;
    expect(padCell.type).toBe('io');
    // c0 should have a placement.
    expect(d.cells.find(c => c.id === 'c0')!.position).toEqual({ x: 0, y: 0 });
    // Each net's pin ids map to materialized pins on the corresponding cells.
    const allPinIds = new Set(d.cells.flatMap(c => c.pins.map(p => p.id)));
    for (const n of d.nets) {
      for (const pid of n.pins) expect(allPinIds.has(pid)).toBe(true);
    }
  });
});
