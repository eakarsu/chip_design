/**
 * Honesty + correctness tests for the placement module that used to be
 * labelled "DeepPlace / GNN / RL / Transformer".
 *
 * These tests pin down the properties the rewrite promises:
 *   - determinism (same input -> same output, no Math.random anywhere),
 *   - real improvement over the legalized starting objective,
 *   - finite, in-bounds, non-overlapping-as-reported results.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  runDeepPlace,
  runGNNPlacement,
  runRLEnhancedPlacement,
  runTransformerPlacement,
  createInitialPlacement,
  computePlacementHPWL,
  computePlacementOverlap,
  legalizeInitialPlacement,
} from '@/lib/algorithms/placement/mlBased';
import { Cell, Net } from '@/types/algorithms';

const CHIP_W = 200;
const CHIP_H = 200;

function makeCells(count = 9): Cell[] {
  const cells: Cell[] = [];
  for (let i = 0; i < count; i++) {
    const w = 10 + (i % 3) * 2;
    const h = 10 + (i % 2) * 2;
    cells.push({
      id: `c${i + 1}`,
      name: `Cell ${i + 1}`,
      width: w,
      height: h,
      pins: [
        { id: `c${i + 1}_in`, name: 'A', position: { x: 1, y: h / 2 }, direction: 'input' },
        { id: `c${i + 1}_out`, name: 'Y', position: { x: w - 1, y: h / 2 }, direction: 'output' },
      ],
      type: 'standard',
    });
  }
  return cells;
}

/** Three loosely connected clusters of three cells each. */
function makeNets(): Net[] {
  const pins = (id: number, kind: 'in' | 'out') => `c${id}_${kind}`;
  return [
    { id: 'n1', name: 'n1', pins: [pins(1, 'out'), pins(2, 'in')], weight: 1 },
    { id: 'n2', name: 'n2', pins: [pins(2, 'out'), pins(3, 'in')], weight: 2 },
    { id: 'n3', name: 'n3', pins: [pins(1, 'in'), pins(3, 'in')], weight: 1 },
    { id: 'n4', name: 'n4', pins: [pins(4, 'out'), pins(5, 'in')], weight: 1 },
    { id: 'n5', name: 'n5', pins: [pins(5, 'out'), pins(6, 'in')], weight: 2 },
    { id: 'n6', name: 'n6', pins: [pins(4, 'in'), pins(6, 'in')], weight: 1 },
    { id: 'n7', name: 'n7', pins: [pins(7, 'out'), pins(8, 'in')], weight: 1 },
    { id: 'n8', name: 'n8', pins: [pins(8, 'out'), pins(9, 'in')], weight: 2 },
    { id: 'n9', name: 'n9', pins: [pins(7, 'in'), pins(9, 'in')], weight: 1 },
    { id: 'n10', name: 'n10', pins: [pins(3, 'out'), pins(4, 'in')], weight: 0.5 },
    { id: 'n11', name: 'n11', pins: [pins(6, 'out'), pins(7, 'in')], weight: 0.5 },
  ];
}

function expectValidResult(
  result: {
    success: boolean;
    cells: Cell[];
    totalWirelength: number;
    overlap: number;
    runtime: number;
    iterations: number;
    convergenceData?: number[];
  },
  input: Cell[]
): void {
  expect(result.success).toBe(true);
  expect(result.cells).toHaveLength(input.length);
  expect(Number.isFinite(result.totalWirelength)).toBe(true);
  expect(result.totalWirelength).toBeGreaterThanOrEqual(0);
  expect(Number.isFinite(result.overlap)).toBe(true);
  expect(result.overlap).toBeGreaterThanOrEqual(0);
  expect(result.overlap).toBeCloseTo(computePlacementOverlap(result.cells), 6);
  expect(Number.isFinite(result.runtime)).toBe(true);
  expect(result.iterations).toBeGreaterThan(0);
  for (const cell of result.cells) {
    expect(cell.position).toBeDefined();
    expect(Number.isFinite(cell.position!.x)).toBe(true);
    expect(Number.isFinite(cell.position!.y)).toBe(true);
    expect(cell.position!.x).toBeGreaterThanOrEqual(0);
    expect(cell.position!.y).toBeGreaterThanOrEqual(0);
    expect(cell.position!.x + cell.width).toBeLessThanOrEqual(CHIP_W + 1e-6);
    expect(cell.position!.y + cell.height).toBeLessThanOrEqual(CHIP_H + 1e-6);
  }
}

/** Throws if the function under test calls Math.random. */
function runWithoutMathRandom<T>(fn: () => T): T {
  const spy = jest.spyOn(Math, 'random').mockImplementation(() => {
    throw new Error('Math.random() was called by algorithm code');
  });
  try {
    return fn();
  } finally {
    spy.mockRestore();
  }
}

function positionsOf(cells: Cell[]): Array<{ id: string; x: number; y: number }> {
  return cells
    .map((c) => ({ id: c.id, x: c.position!.x, y: c.position!.y }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

describe('deterministic analytical placement (mlBased)', () => {
  it('contains no Math.random call in its source', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src/lib/algorithms/placement/mlBased.ts'),
      'utf8'
    );
    expect(source).not.toMatch(/Math\.random/);
  });

  it('createInitialPlacement is deterministic and seeds the same layout', () => {
    const cells = makeCells();
    const nets = makeNets();
    const a = createInitialPlacement(cells, nets, CHIP_W, CHIP_H);
    const b = createInitialPlacement(cells, nets, CHIP_W, CHIP_H);
    expect(positionsOf(a)).toEqual(positionsOf(b));
    const seeded = createInitialPlacement(cells, nets, CHIP_W, CHIP_H, 1234);
    const seededAgain = createInitialPlacement(cells, nets, CHIP_W, CHIP_H, 1234);
    expect(positionsOf(seeded)).toEqual(positionsOf(seededAgain));
    expect(computePlacementHPWL(seeded, nets)).toBeGreaterThan(0);
  });

  it('runDeepPlace is deterministic, calls no Math.random, and improves its objective', () => {
    const cells = makeCells();
    const nets = makeNets();

    const first = runWithoutMathRandom(() =>
      runDeepPlace(cells, nets, CHIP_W, CHIP_H, { iterations: 120 })
    );
    const second = runDeepPlace(cells, nets, CHIP_W, CHIP_H, { iterations: 120 });

    expectValidResult(first, cells);
    expect(positionsOf(first.cells)).toEqual(positionsOf(second.cells));
    expect(first.totalWirelength).toEqual(second.totalWirelength);

    // Real optimization: best-so-far HPWL tracked during the descent must be
    // monotonically non-increasing and strictly improved from the start.
    const convergence = first.convergenceData!;
    expect(convergence.length).toBe(121);
    for (let i = 1; i < convergence.length; i++) {
      expect(convergence[i]).toBeLessThanOrEqual(convergence[i - 1] + 1e-9);
    }
    expect(convergence[convergence.length - 1]).toBeLessThan(convergence[0]);

    // The returned legal placement may not be worse than legalizing the same
    // deterministic starting point.
    const baseline = legalizeInitialPlacement(cells, nets, CHIP_W, CHIP_H);
    expect(first.totalWirelength).toBeLessThanOrEqual(baseline.totalWirelength + 1e-6);

    // An explicit seed is honoured: same seed -> same output.
    const seededA = runDeepPlace(cells, nets, CHIP_W, CHIP_H, { iterations: 40, seed: 7 });
    const seededB = runDeepPlace(cells, nets, CHIP_W, CHIP_H, { iterations: 40, seed: 7 });
    expect(positionsOf(seededA.cells)).toEqual(positionsOf(seededB.cells));
  });

  it('runGNNPlacement is deterministic and no worse than the legalized start', () => {
    const cells = makeCells();
    const nets = makeNets();
    const first = runWithoutMathRandom(() =>
      runGNNPlacement(cells, nets, CHIP_W, CHIP_H, { iterations: 60 })
    );
    const second = runGNNPlacement(cells, nets, CHIP_W, CHIP_H, { iterations: 60 });
    expectValidResult(first, cells);
    expect(positionsOf(first.cells)).toEqual(positionsOf(second.cells));
    const baseline = legalizeInitialPlacement(cells, nets, CHIP_W, CHIP_H);
    expect(first.totalWirelength).toBeLessThanOrEqual(baseline.totalWirelength + 1e-6);
  });

  it('runRLEnhancedPlacement is deterministic hill-climbing, not RL', () => {
    const cells = makeCells();
    const nets = makeNets();
    const first = runWithoutMathRandom(() =>
      runRLEnhancedPlacement(cells, nets, CHIP_W, CHIP_H, { episodes: 30 })
    );
    const second = runRLEnhancedPlacement(cells, nets, CHIP_W, CHIP_H, { episodes: 30 });
    expectValidResult(first, cells);
    expect(positionsOf(first.cells)).toEqual(positionsOf(second.cells));
    const convergence = first.convergenceData!;
    expect(convergence[convergence.length - 1]).toBeLessThanOrEqual(convergence[0]);
    const baseline = legalizeInitialPlacement(cells, nets, CHIP_W, CHIP_H);
    expect(first.totalWirelength).toBeLessThanOrEqual(baseline.totalWirelength + 1e-6);
  });

  it('runTransformerPlacement is deterministic and no worse than the legalized start', () => {
    const cells = makeCells();
    const nets = makeNets();
    const first = runWithoutMathRandom(() =>
      runTransformerPlacement(cells, nets, CHIP_W, CHIP_H, { iterations: 60, numLayers: 4 })
    );
    const second = runTransformerPlacement(cells, nets, CHIP_W, CHIP_H, { iterations: 60, numLayers: 4 });
    expectValidResult(first, cells);
    expect(positionsOf(first.cells)).toEqual(positionsOf(second.cells));
    const baseline = legalizeInitialPlacement(cells, nets, CHIP_W, CHIP_H);
    expect(first.totalWirelength).toBeLessThanOrEqual(baseline.totalWirelength + 1e-6);
  });

  it('does not mutate the input cells', () => {
    const cells = makeCells();
    const nets = makeNets();
    runDeepPlace(cells, nets, CHIP_W, CHIP_H, { iterations: 20 });
    runGNNPlacement(cells, nets, CHIP_W, CHIP_H, { iterations: 20 });
    runRLEnhancedPlacement(cells, nets, CHIP_W, CHIP_H, { episodes: 10 });
    runTransformerPlacement(cells, nets, CHIP_W, CHIP_H, { iterations: 20 });
    for (const cell of cells) {
      expect(cell.position).toBeUndefined();
    }
  });

  it('handles empty inputs without NaN or Infinity', () => {
    for (const result of [
      runDeepPlace([], [], CHIP_W, CHIP_H),
      runGNNPlacement([], [], CHIP_W, CHIP_H),
      runRLEnhancedPlacement([], [], CHIP_W, CHIP_H),
      runTransformerPlacement([], [], CHIP_W, CHIP_H),
    ]) {
      expect(result.success).toBe(true);
      expect(result.cells).toEqual([]);
      expect(result.totalWirelength).toBe(0);
      expect(result.overlap).toBe(0);
      expect(Number.isFinite(result.runtime)).toBe(true);
      expect(result.convergenceData ?? []).toEqual([]);
    }
  });

  it('reports the true overlap area instead of a hard-coded zero', () => {
    // Two 60x60 cells stacked at the same origin overlap by 3600 area units.
    const make = (i: number): Cell => ({
      id: `overlap${i}`,
      name: `Overlap ${i}`,
      width: 60,
      height: 60,
      position: { x: 0, y: 0 },
      pins: [{ id: `overlap${i}_p`, name: 'P', position: { x: 1, y: 1 }, direction: 'input' }],
      type: 'standard',
    });
    expect(computePlacementOverlap([make(0), make(1)])).toBe(3600);

    // Every solver must report exactly the overlap it returns, not a constant.
    const cells = makeCells();
    const nets = makeNets();
    for (const result of [
      runDeepPlace(cells, nets, CHIP_W, CHIP_H, { iterations: 20 }),
      runGNNPlacement(cells, nets, CHIP_W, CHIP_H, { iterations: 20 }),
      runRLEnhancedPlacement(cells, nets, CHIP_W, CHIP_H, { episodes: 10 }),
      runTransformerPlacement(cells, nets, CHIP_W, CHIP_H, { iterations: 20 }),
    ]) {
      expect(result.overlap).toBeCloseTo(computePlacementOverlap(result.cells), 6);
    }
  });
});
