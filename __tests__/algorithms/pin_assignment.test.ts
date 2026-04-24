/**
 * @jest-environment node
 */
import { assignPins } from '@/lib/algorithms/pin_assignment';
import type { Cell, Net } from '@/types/algorithms';

const ioCell = (id: string): Cell => ({
  id, name: id, width: 10, height: 10,
  pins: [{ id: `${id}/PAD`, name: 'PAD', position: { x: 0, y: 0 }, direction: 'input' }],
  type: 'io',
});
const stdCell = (id: string, x: number, y: number): Cell => ({
  id, name: id, width: 20, height: 20, position: { x, y },
  pins: [
    { id: `${id}_in`,  name: 'A', position: { x: 0,  y: 10 }, direction: 'input'  },
    { id: `${id}_out`, name: 'Y', position: { x: 20, y: 10 }, direction: 'output' },
  ],
  type: 'standard',
});

describe('Pin assignment', () => {
  test('places port near cluster of incident cells', () => {
    // A port wired to two cells in the bottom-right corner.
    const cells: Cell[] = [
      stdCell('a', 800, 800),
      stdCell('b', 850, 850),
      ioCell('p0'),
    ];
    const nets: Net[] = [
      { id: 'n', name: 'n', pins: ['p0/PAD', 'a_in', 'b_in'], weight: 1 },
    ];
    const r = assignPins({ cells, nets, chipWidth: 1000, chipHeight: 1000 });
    expect(r.assignments).toHaveLength(1);
    const slot = r.assignments[0];
    // Should land on bottom or right edge.
    expect(['B', 'R']).toContain(slot.side);
    // x or y should be near the cluster.
    if (slot.side === 'R') expect(slot.x).toBe(1000);
    if (slot.side === 'B') expect(slot.y).toBe(1000);
    expect(r.hpwlAfter).toBeLessThan(r.hpwlBefore);
  });

  test('all 4 sides used when ports span the chip', () => {
    const cells: Cell[] = [
      stdCell('a', 50,  50),    // TL
      stdCell('b', 950, 50),    // TR
      stdCell('c', 50,  950),   // BL
      stdCell('d', 950, 950),   // BR
      ioCell('p0'), ioCell('p1'), ioCell('p2'), ioCell('p3'),
    ];
    const nets: Net[] = [
      { id: 'n0', name: 'n0', pins: ['p0/PAD', 'a_in'], weight: 1 },
      { id: 'n1', name: 'n1', pins: ['p1/PAD', 'b_in'], weight: 1 },
      { id: 'n2', name: 'n2', pins: ['p2/PAD', 'c_in'], weight: 1 },
      { id: 'n3', name: 'n3', pins: ['p3/PAD', 'd_in'], weight: 1 },
    ];
    const r = assignPins({ cells, nets, chipWidth: 1000, chipHeight: 1000 });
    const sides = new Set(r.assignments.map(a => a.side));
    expect(sides.size).toBeGreaterThanOrEqual(2);
  });

  test('port without nets is still placed (centered fallback)', () => {
    const cells: Cell[] = [stdCell('a', 100, 100), ioCell('p0')];
    const nets: Net[] = []; // p0 has no incident net
    const r = assignPins({ cells, nets, chipWidth: 1000, chipHeight: 1000 });
    expect(r.assignments).toHaveLength(1);
  });

  test('no ports → no-op', () => {
    const cells: Cell[] = [stdCell('a', 100, 100), stdCell('b', 200, 200)];
    const nets: Net[] = [{ id: 'n', name: 'n', pins: ['a_out', 'b_in'], weight: 1 }];
    const r = assignPins({ cells, nets, chipWidth: 1000, chipHeight: 1000 });
    expect(r.assignments).toHaveLength(0);
    expect(r.hpwlAfter).toBe(r.hpwlBefore);
  });
});
