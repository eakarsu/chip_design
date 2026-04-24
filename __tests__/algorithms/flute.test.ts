/**
 * @jest-environment node
 */
import { flute, totalRsmtWirelength } from '@/lib/algorithms/flute';

describe('FLUTE — RSMT', () => {
  test('two-pin net is a single L-shape with HPWL length', () => {
    const r = flute({ pins: [{ x: 0, y: 0 }, { x: 10, y: 5 }] });
    expect(r.success).toBe(true);
    expect(r.tree.wirelength).toBe(15);
    expect(r.hpwl).toBe(15);
  });

  test('three pins on an L produce wirelength = HPWL', () => {
    const r = flute({
      pins: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }],
    });
    expect(r.tree.wirelength).toBe(20);
    expect(r.hpwl).toBe(20);
  });

  test('three collinear pins use a single segment', () => {
    const r = flute({ pins: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 10, y: 0 }] });
    expect(r.tree.wirelength).toBe(10);
  });

  test('single pin has zero length', () => {
    const r = flute({ pins: [{ x: 5, y: 5 }] });
    expect(r.tree.wirelength).toBe(0);
  });

  test('1-Steiner improvement is no worse than spanning tree', () => {
    const pins = [
      { x: 0, y: 0 }, { x: 0, y: 10 }, { x: 10, y: 0 }, { x: 10, y: 10 },
      { x: 5, y: 5 },
    ];
    const r = flute({ pins });
    expect(r.reduction).toBeGreaterThanOrEqual(0);
  });

  test('totalRsmtWirelength sums per-net lengths', () => {
    const nets = [
      { pins: [{ x: 0, y: 0 }, { x: 10, y: 0 }] }, // 10
      { pins: [{ x: 0, y: 0 }, { x: 0, y: 5 }] },  // 5
    ];
    const r = totalRsmtWirelength(nets);
    expect(r.wirelength).toBe(15);
    expect(r.perNet).toEqual([10, 5]);
  });
});
