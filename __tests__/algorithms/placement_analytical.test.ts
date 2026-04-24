/**
 * @jest-environment node
 */
import { quadraticPlacement } from '@/lib/algorithms/placement_analytical';
import type { PlacementParams, Cell, Net } from '@/types/algorithms';

function makeCells(n: number, w = 20, h = 20): Cell[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `c${i}`,
    name: `c${i}`,
    width: w,
    height: h,
    pins: [
      { id: `c${i}_in`, name: 'A', position: { x: 0, y: h / 2 }, direction: 'input' },
      { id: `c${i}_out`, name: 'Y', position: { x: w, y: h / 2 }, direction: 'output' },
    ],
    type: 'standard',
  }));
}

function chain(n: number): Net[] {
  // Chain: c0_out -> c1_in, c1_out -> c2_in, ...
  return Array.from({ length: n - 1 }, (_, i) => ({
    id: `n${i}`,
    name: `n${i}`,
    pins: [`c${i}_out`, `c${i + 1}_in`],
    weight: 1,
  }));
}

function params(cells: Cell[], nets: Net[]): PlacementParams {
  return {
    algorithm: 'analytical' as any,
    chipWidth: 1000,
    chipHeight: 1000,
    cells,
    nets,
    iterations: 0,
  };
}

describe('Quadratic placement', () => {
  test('places all cells inside chip area', () => {
    const cells = makeCells(10);
    const r = quadraticPlacement(params(cells, chain(10)));
    expect(r.success).toBe(true);
    for (const c of r.cells) {
      expect(c.position).toBeDefined();
      expect(c.position!.x).toBeGreaterThanOrEqual(0);
      expect(c.position!.x).toBeLessThanOrEqual(1000 - c.width);
      expect(c.position!.y).toBeGreaterThanOrEqual(0);
      expect(c.position!.y).toBeLessThanOrEqual(1000 - c.height);
    }
  });

  test('handles empty input', () => {
    const r = quadraticPlacement(params([], []));
    expect(r.success).toBe(true);
    expect(r.cells.length).toBe(0);
  });

  test('chain net produces ordered placement (smaller wirelength than random anchor)', () => {
    const cells = makeCells(8);
    const r = quadraticPlacement(params(cells, chain(8)));
    // Wirelength should be much less than the worst-case (chip diagonal × n).
    expect(r.totalWirelength).toBeLessThan(1000 * 8);
    expect(r.totalWirelength).toBeGreaterThan(0);
  });

  test('isolated cell is anchored to chip center', () => {
    const cells = makeCells(1);
    const r = quadraticPlacement(params(cells, []));
    const cx = r.cells[0].position!.x + cells[0].width / 2;
    const cy = r.cells[0].position!.y + cells[0].height / 2;
    expect(Math.abs(cx - 500)).toBeLessThan(1);
    expect(Math.abs(cy - 500)).toBeLessThan(1);
  });
});
