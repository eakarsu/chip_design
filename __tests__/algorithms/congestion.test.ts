/**
 * @jest-environment node
 */
import {
  rudyCongestion,
  probabilisticCongestion,
} from '@/lib/algorithms/congestion';
import {
  RoutingAlgorithm,
  RoutingParams,
  Cell,
  Net,
} from '@/types/algorithms';

function makeCell(id: string, x: number, y: number): Cell {
  return {
    id, name: id, width: 10, height: 10,
    position: { x, y },
    pins: [
      { id: `${id}_p`, name: 'p', position: { x: 5, y: 5 }, direction: 'inout' },
    ],
    type: 'standard',
  };
}

function net(id: string, pinIds: string[]): Net {
  return { id, name: id, pins: pinIds, weight: 1 };
}

function makeParams(cells: Cell[], nets: Net[]): RoutingParams {
  return {
    algorithm: RoutingAlgorithm.GLOBAL_ROUTING,
    chipWidth: 100, chipHeight: 100,
    cells, nets,
    layers: 2,
    gridSize: 10,
  };
}

describe('rudyCongestion', () => {
  it('returns positive congestion for a non-trivial netlist', () => {
    const cells = [
      makeCell('a', 5, 5),
      makeCell('b', 80, 80),
      makeCell('c', 5, 80),
      makeCell('d', 80, 5),
    ];
    const nets = [
      net('n1', ['a_p', 'b_p']),
      net('n2', ['c_p', 'd_p']),
    ];
    const r = rudyCongestion(makeParams(cells, nets));
    expect(r.success).toBe(true);
    expect(r.congestion).toBeGreaterThan(0);
    expect(r.wires).toHaveLength(2);
  });

  it('reports higher congestion when many nets overlap one tile', () => {
    // All nets cross the chip center.
    const cells = [
      makeCell('left', 5, 50),
      makeCell('right', 80, 50),
      makeCell('top', 50, 5),
      makeCell('bot', 50, 80),
    ];
    const sparse = rudyCongestion(makeParams(cells, [net('n1', ['left_p', 'right_p'])]));
    const dense = rudyCongestion(makeParams(cells, [
      net('n1', ['left_p', 'right_p']),
      net('n2', ['left_p', 'right_p']),
      net('n3', ['top_p', 'bot_p']),
      net('n4', ['top_p', 'bot_p']),
    ]));
    expect(dense.congestion).toBeGreaterThan(sparse.congestion);
  });

  it('totalWirelength matches sum of bbox half-perimeters', () => {
    const cells = [makeCell('a', 0, 0), makeCell('b', 50, 50)];
    const r = rudyCongestion(makeParams(cells, [net('n1', ['a_p', 'b_p'])]));
    // bbox: x1=5, x2=55, y1=5, y2=55 → half-perimeter 100.
    expect(r.totalWirelength).toBeCloseTo(100, 5);
  });
});

describe('probabilisticCongestion', () => {
  it('produces a positive congestion estimate', () => {
    const cells = [
      makeCell('a', 5, 5),
      makeCell('b', 80, 80),
    ];
    const r = probabilisticCongestion(makeParams(cells, [net('n1', ['a_p', 'b_p'])]));
    expect(r.success).toBe(true);
    expect(r.congestion).toBeGreaterThan(0);
  });

  it('has the same total wirelength as RUDY (both use bboxes)', () => {
    const cells = [makeCell('a', 0, 0), makeCell('b', 90, 90)];
    const p = makeParams(cells, [net('n1', ['a_p', 'b_p'])]);
    expect(probabilisticCongestion(p).totalWirelength)
      .toBeCloseTo(rudyCongestion(p).totalWirelength, 5);
  });
});
