/**
 * @jest-environment node
 */
import { runSTA } from '@/lib/algorithms/sta_graph';
import type { Cell, Net } from '@/types/algorithms';

const ioIn = (id: string, x = 0, y = 0): Cell => ({
  id, name: id, width: 10, height: 10, position: { x, y },
  pins: [{ id: `${id}/PAD`, name: 'PAD', position: { x: 0, y: 0 }, direction: 'output' }],
  type: 'io',
});
const ioOut = (id: string, x = 0, y = 0): Cell => ({
  id, name: id, width: 10, height: 10, position: { x, y },
  pins: [{ id: `${id}/PAD`, name: 'PAD', position: { x: 0, y: 0 }, direction: 'input' }],
  type: 'io',
});
const std = (id: string, x: number, y: number): Cell => ({
  id, name: id, width: 20, height: 20, position: { x, y },
  pins: [
    { id: `${id}_in`,  name: 'A', position: { x: 0,  y: 10 }, direction: 'input'  },
    { id: `${id}_out`, name: 'Y', position: { x: 20, y: 10 }, direction: 'output' },
  ],
  type: 'standard',
});

describe('Graph STA', () => {
  test('combinational chain: arrival accumulates cell + wire delay', () => {
    // io_in/PAD -> a_in -> a_out -> b_in -> b_out -> io_out/PAD
    const cells: Cell[] = [ioIn('si', 0, 0), std('a', 100, 0), std('b', 200, 0), ioOut('so', 400, 0)];
    const nets: Net[] = [
      { id: 'n0', name: 'n0', pins: ['si/PAD', 'a_in'],   weight: 1 },
      { id: 'n1', name: 'n1', pins: ['a_out',  'b_in'],   weight: 1 },
      { id: 'n2', name: 'n2', pins: ['b_out',  'so/PAD'], weight: 1 },
    ];
    const r = runSTA({ cells, nets, clockPeriod: 100, cellDelay: 0.5, wireDelayPerUnit: 0.01 });
    expect(r.startpoints).toBe(1);
    expect(r.endpoints).toBe(1);
    // 2 cell delays + ~ (100 + 200 + 200) * 0.01 wire ≈ 1.0 + 5.0 = ~6.0
    expect(r.maxArrival).toBeGreaterThan(0);
    expect(r.wns).toBeGreaterThan(0); // 100ns clock easily met
    expect(r.criticalPath.length).toBeGreaterThanOrEqual(2);
    expect(r.criticalPath[r.criticalPath.length - 1]).toBe('so/PAD');
  });

  test('tight clock causes negative slack and setup violation', () => {
    const cells: Cell[] = [ioIn('si'), std('a', 0, 0), std('b', 0, 0), ioOut('so')];
    const nets: Net[] = [
      { id: 'n0', name: 'n0', pins: ['si/PAD', 'a_in'],   weight: 1 },
      { id: 'n1', name: 'n1', pins: ['a_out',  'b_in'],   weight: 1 },
      { id: 'n2', name: 'n2', pins: ['b_out',  'so/PAD'], weight: 1 },
    ];
    const r = runSTA({ cells, nets, clockPeriod: 0.5, cellDelay: 1.0, wireDelayPerUnit: 0 });
    // 2 cell delays = 2.0 ns > 0.5 ns clock → negative slack
    expect(r.wns).toBeLessThan(0);
    expect(r.tns).toBeGreaterThan(0);
    expect(r.setupViolations).toBeGreaterThanOrEqual(1);
  });

  test('combinational cycle throws', () => {
    // a_out -> b_in, b_out -> a_in (loop)
    const cells: Cell[] = [std('a', 0, 0), std('b', 50, 0)];
    const nets: Net[] = [
      { id: 'n0', name: 'n0', pins: ['a_out', 'b_in'], weight: 1 },
      { id: 'n1', name: 'n1', pins: ['b_out', 'a_in'], weight: 1 },
    ];
    expect(() => runSTA({ cells, nets, clockPeriod: 10 })).toThrow(/cycle/);
  });

  test('rejects non-positive clock period', () => {
    expect(() => runSTA({ cells: [], nets: [], clockPeriod: 0 })).toThrow();
    expect(() => runSTA({ cells: [], nets: [], clockPeriod: -1 })).toThrow();
  });

  test('per-cell delay overrides apply', () => {
    const cells: Cell[] = [ioIn('si'), std('slow', 0, 0), ioOut('so', 100, 0)];
    const nets: Net[] = [
      { id: 'n0', name: 'n0', pins: ['si/PAD', 'slow_in'], weight: 1 },
      { id: 'n1', name: 'n1', pins: ['slow_out', 'so/PAD'], weight: 1 },
    ];
    const baseline = runSTA({ cells, nets, clockPeriod: 10, cellDelay: 0.1, wireDelayPerUnit: 0 });
    const slowed   = runSTA({ cells, nets, clockPeriod: 10, cellDelay: 0.1, wireDelayPerUnit: 0,
      cellDelays: { slow: 5.0 } });
    expect(slowed.maxArrival).toBeGreaterThan(baseline.maxArrival);
  });
});
