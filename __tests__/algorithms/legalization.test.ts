/**
 * @jest-environment node
 */
import {
  tetrisLegalization,
  abacusLegalization,
} from '@/lib/algorithms/legalization';
import {
  PlacementAlgorithm,
  PlacementParams,
  Cell,
} from '@/types/algorithms';

function makeCells(n: number, w = 30, h = 20): Cell[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `c${i}`,
    name: `c${i}`,
    width: w,
    height: h,
    position: { x: i * 25, y: 5 }, // initially overlapping (25 < 30)
    pins: [
      { id: `c${i}_o`, name: 'O', position: { x: 0, y: 0 }, direction: 'output' },
      { id: `c${i}_i`, name: 'I', position: { x: w, y: 0 }, direction: 'input' },
    ],
    type: 'standard',
  }));
}

function params(cells: Cell[]): PlacementParams {
  return {
    algorithm: PlacementAlgorithm.SIMULATED_ANNEALING,
    chipWidth: 500,
    chipHeight: 200,
    cells,
    nets: [{ id: 'n0', name: 'n0', pins: ['c0_o', 'c1_i'], weight: 1 }],
  };
}

function noOverlapWithinRow(cells: Cell[], rowHeight: number): boolean {
  // Group by row Y, ensure cells in same row don't overlap horizontally.
  const byRow = new Map<number, Cell[]>();
  for (const c of cells) {
    const y = c.position!.y;
    const arr = byRow.get(y) ?? [];
    arr.push(c);
    byRow.set(y, arr);
  }
  for (const [, list] of byRow) {
    list.sort((a, b) => a.position!.x - b.position!.x);
    for (let i = 1; i < list.length; i++) {
      const prev = list[i - 1];
      const cur = list[i];
      if (prev.position!.x + prev.width > cur.position!.x + 1e-6) return false;
    }
  }
  return true;
}

describe('tetrisLegalization', () => {
  it('eliminates horizontal overlap in each row', () => {
    const r = tetrisLegalization(params(makeCells(8)));
    expect(r.success).toBe(true);
    expect(r.cells).toHaveLength(8);
    expect(noOverlapWithinRow(r.cells, 20)).toBe(true);
  });

  it('snaps cells to row Y values', () => {
    const r = tetrisLegalization(params(makeCells(5)));
    const ys = new Set(r.cells.map(c => c.position!.y));
    // Every Y should be a multiple of row height (20).
    for (const y of ys) expect(y % 20).toBe(0);
  });

  it('seeds positions when input cells lack them', () => {
    const cells = makeCells(4).map(c => ({ ...c, position: undefined }));
    const r = tetrisLegalization(params(cells as Cell[]));
    expect(r.cells.every(c => c.position !== undefined)).toBe(true);
  });

  it('reports HPWL > 0 for connected cells', () => {
    const r = tetrisLegalization(params(makeCells(4)));
    expect(r.totalWirelength).toBeGreaterThan(0);
  });
});

describe('abacusLegalization', () => {
  it('eliminates horizontal overlap in each row', () => {
    const r = abacusLegalization(params(makeCells(10)));
    expect(r.success).toBe(true);
    expect(r.cells).toHaveLength(10);
    expect(noOverlapWithinRow(r.cells, 20)).toBe(true);
  });

  it('produces lower or equal displacement than tetris on a clustered input', () => {
    // Bias all cells to the same x — abacus should batch them into one cluster
    // that distributes evenly, while tetris just packs greedily.
    const cells: Cell[] = makeCells(10).map(c => ({
      ...c,
      position: { x: 100, y: 0 },
    }));
    const tet = tetrisLegalization(params(cells));
    const aba = abacusLegalization(params(cells));
    const totalDisp = (out: typeof tet) => out.cells.reduce(
      (s, c) => s + Math.abs(c.position!.x - 100), 0,
    );
    expect(totalDisp(aba)).toBeLessThanOrEqual(totalDisp(tet));
  });
});
