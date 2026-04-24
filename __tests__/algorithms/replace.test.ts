import { runRePlAce } from '@/lib/algorithms/replace';
import { Cell, Net } from '@/types/algorithms';

/** Construct a chain of `n` standard cells, wired A→Y sequentially. */
function chain(n: number): { cells: Cell[]; nets: Net[] } {
  const cells: Cell[] = [];
  const nets: Net[] = [];
  for (let i = 0; i < n; i++) {
    cells.push({
      id: `u${i}`, name: `u${i}`, width: 4, height: 4,
      position: { x: 10 + (i * 0.01), y: 10 }, // clustered at start
      type: 'standard',
      pins: [
        { id: `u${i}.A`, name: 'A', position: { x: 0, y: 0 }, direction: 'input' },
        { id: `u${i}.Y`, name: 'Y', position: { x: 0, y: 0 }, direction: 'output' },
      ],
    });
    if (i > 0) {
      nets.push({
        id: `n${i}`, name: `n${i}`,
        pins: [`u${i-1}.Y`, `u${i}.A`], weight: 1,
      });
    }
  }
  return { cells, nets };
}

describe('RePlAce — basic placement behaviour', () => {
  it('completes and returns a PlacementResult', () => {
    const { cells, nets } = chain(20);
    const res = runRePlAce(cells, nets, {
      chipWidth: 100, chipHeight: 100, iterations: 50, seed: 42,
    });
    expect(res.success).toBe(true);
    expect(res.cells).toHaveLength(20);
    expect(typeof res.totalWirelength).toBe('number');
    expect(res.convergenceData?.length).toBeGreaterThan(0);
  });

  it('keeps every cell inside the die area', () => {
    const { cells, nets } = chain(15);
    const res = runRePlAce(cells, nets, {
      chipWidth: 80, chipHeight: 80, iterations: 40, seed: 7,
    });
    for (const c of res.cells) {
      const halfW = c.width / 2, halfH = c.height / 2;
      expect(c.position!.x).toBeGreaterThanOrEqual(halfW - 1e-6);
      expect(c.position!.y).toBeGreaterThanOrEqual(halfH - 1e-6);
      expect(c.position!.x).toBeLessThanOrEqual(80 - halfW + 1e-6);
      expect(c.position!.y).toBeLessThanOrEqual(80 - halfH + 1e-6);
    }
  });

  it('spreads clustered cells out (density term reduces peak bin usage)', () => {
    // 25 cells all piled on a single spot.
    const cells: Cell[] = Array.from({ length: 25 }, (_, i) => ({
      id: `c${i}`, name: `c${i}`, width: 4, height: 4,
      position: { x: 20, y: 20 },
      pins: [], type: 'standard',
    }));
    const res = runRePlAce(cells, [], {
      chipWidth: 100, chipHeight: 100, iterations: 120,
      lambda: 0.05, lambdaGrowth: 1.05, seed: 1,
    });
    // Measure peak overlap before/after. Overlap returned by runRePlAce is
    // the final state — initial state has every cell on one point so
    // overlap is maximal. Post-spread overlap should drop substantially.
    expect(res.overlap).toBeLessThan(25 * 4 * 4); // less than the full pile area
  });

  it('converges toward shorter HPWL when only wirelength matters (λ=0)', () => {
    const { cells, nets } = chain(10);
    // Spread the initial positions so HPWL starts high.
    cells.forEach((c, i) => { c.position = { x: (i * 9) % 100, y: (i * 13) % 100 }; });
    const res = runRePlAce(cells, nets, {
      chipWidth: 100, chipHeight: 100, iterations: 120,
      lambda: 0, lambdaGrowth: 1, seed: 3,
    });
    const start = res.convergenceData![0];
    const end = res.convergenceData![res.convergenceData!.length - 1];
    expect(end).toBeLessThan(start);
  });

  it('handles empty nets list gracefully', () => {
    const cells: Cell[] = [{
      id: 'c', name: 'c', width: 4, height: 4,
      position: { x: 50, y: 50 }, pins: [], type: 'standard',
    }];
    const res = runRePlAce(cells, [], {
      chipWidth: 100, chipHeight: 100, iterations: 10,
    });
    expect(res.success).toBe(true);
    expect(res.totalWirelength).toBe(0);
  });

  it('produces deterministic results for the same seed', () => {
    const run = () => {
      const { cells, nets } = chain(8);
      return runRePlAce(cells, nets, {
        chipWidth: 80, chipHeight: 80, iterations: 30, seed: 99,
      });
    };
    const a = run();
    const b = run();
    expect(a.totalWirelength).toBeCloseTo(b.totalWirelength, 6);
    for (let i = 0; i < a.cells.length; i++) {
      expect(a.cells[i].position!.x).toBeCloseTo(b.cells[i].position!.x, 6);
      expect(a.cells[i].position!.y).toBeCloseTo(b.cells[i].position!.y, 6);
    }
  });
});
