/**
 * Determinism / honesty tests for the modules where random sampling was
 * replaced by deterministic estimates. These pin down:
 *   - identical inputs produce identical outputs,
 *   - Math.random is never called while the algorithms run,
 *   - the modules report measured values (slack, overlap, overflow) rather
 *     than constants.
 */

import * as fs from 'fs';
import * as path from 'path';
import { staticTimingAnalysis, criticalPathAnalysis } from '@/lib/algorithms/timing';
import { runGNNRouting } from '@/lib/algorithms/routing/modern';
import {
  runEPlace,
  runNTUPlace,
  runMPL,
  runCapo,
} from '@/lib/algorithms/placement/industrial';
import { sequencePairFloorplanning } from '@/lib/algorithms/floorplanning';
import { hTreeClock, dmeAlgorithm } from '@/lib/algorithms/clocktree';
import {
  Cell,
  Net,
  TimingAlgorithm,
  TimingParams,
  FloorplanningAlgorithm,
  ClockTreeAlgorithm,
} from '@/types/algorithms';

const CHIP_W = 200;
const CHIP_H = 200;

function makeCells(count = 6): Cell[] {
  const cells: Cell[] = [];
  for (let i = 0; i < count; i++) {
    cells.push({
      id: `c${i + 1}`,
      name: `Cell ${i + 1}`,
      width: 12 + (i % 3) * 2,
      height: 10 + (i % 2) * 2,
      pins: [
        { id: `c${i + 1}_in`, name: 'A', position: { x: 1, y: 5 }, direction: 'input' },
        { id: `c${i + 1}_out`, name: 'Y', position: { x: 11, y: 5 }, direction: 'output' },
      ],
      type: 'standard',
    });
  }
  return cells;
}

function makeNets(): Net[] {
  return [
    { id: 'n1', name: 'n1', pins: ['c1_out', 'c2_in'], weight: 1 },
    { id: 'n2', name: 'n2', pins: ['c2_out', 'c3_in'], weight: 2 },
    { id: 'n3', name: 'n3', pins: ['c3_out', 'c4_in'], weight: 1 },
    { id: 'n4', name: 'n4', pins: ['c4_out', 'c5_in'], weight: 2 },
    { id: 'n5', name: 'n5', pins: ['c5_out', 'c6_in'], weight: 1 },
  ];
}

function timingParams(algorithm: TimingAlgorithm, clockPeriod = 10): TimingParams {
  return {
    algorithm,
    netlist: 'module test(); endmodule',
    clockPeriod,
    cells: makeCells(6).map((c, i) => ({ ...c, position: { x: i * 20, y: 10 } })),
    wires: [
      { id: 'w1', netId: 'n1', points: [{ x: 11, y: 15 }, { x: 31, y: 15 }], layer: 0, width: 1 },
      { id: 'w2', netId: 'n2', points: [{ x: 31, y: 15 }, { x: 51, y: 15 }], layer: 0, width: 1 },
    ],
  };
}

function source(relPath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relPath), 'utf8');
}

/** Throws if the function under test calls Math.random. */
function withoutMathRandom<T>(fn: () => T): T {
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
    .map((c) => ({ id: c.id, x: c.position?.x ?? NaN, y: c.position?.y ?? NaN }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

function overlapArea(cells: Cell[]): number {
  let area = 0;
  for (let i = 0; i < cells.length; i++) {
    for (let j = i + 1; j < cells.length; j++) {
      const a = cells[i].position;
      const b = cells[j].position;
      if (!a || !b) continue;
      const w = Math.min(a.x + cells[i].width, b.x + cells[j].width) - Math.max(a.x, b.x);
      const h = Math.min(a.y + cells[i].height, b.y + cells[j].height) - Math.max(a.y, b.y);
      if (w > 0 && h > 0) area += w * h;
    }
  }
  return area;
}

interface ClockNodeShape {
  id: string;
  position: { x: number; y: number };
  isSink: boolean;
  children: ClockNodeShape[];
}

/** Parent pointers make ClockNode graphs circular; compare the tree shape. */
function treeShape(node: ClockNodeShape): unknown {
  return {
    id: node.id,
    x: node.position.x,
    y: node.position.y,
    isSink: node.isSink,
    children: node.children.map(treeShape),
  };
}

describe('deterministic timing estimation', () => {
  it('timing.ts contains no random sampling', () => {
    expect(source('src/lib/algorithms/timing.ts')).not.toMatch(/Math\.random/);
  });

  it('staticTimingAnalysis is reproducible and reports consistent slack', () => {
    const params = timingParams(TimingAlgorithm.STATIC_TIMING_ANALYSIS, 10);
    const first = withoutMathRandom(() => staticTimingAnalysis(params));
    const second = staticTimingAnalysis(params);

    expect(first.criticalPath).toEqual(second.criticalPath);
    expect(first.maxDelay).toBe(second.maxDelay);
    expect(first.minDelay).toBe(second.minDelay);
    expect(first.clockSkew).toBe(second.clockSkew);
    expect(first.slackTime).toBe(second.slackTime);
    expect(first.setupViolations).toBe(second.setupViolations);

    expect(first.slackTime).toBeCloseTo(10 - first.maxDelay, 9);
    expect(first.maxDelay).toBeGreaterThan(first.minDelay);
    expect(first.clockSkew).toBeGreaterThanOrEqual(0);
    expect(first.clockSkew).toBeLessThan(10);

    const cellIds = new Set(params.cells.map((c) => c.id));
    expect(first.criticalPath.length).toBeGreaterThan(0);
    expect(first.criticalPath.length).toBeLessThanOrEqual(params.cells.length);
    for (const id of first.criticalPath) {
      expect(cellIds.has(id)).toBe(true);
    }
  });

  it('criticalPathAnalysis is reproducible', () => {
    const params = timingParams(TimingAlgorithm.CRITICAL_PATH, 30);
    const first = withoutMathRandom(() => criticalPathAnalysis(params));
    const second = criticalPathAnalysis(params);
    expect(first.criticalPath).toEqual(second.criticalPath);
    expect(first.maxDelay).toBe(second.maxDelay);
    expect(first.minDelay).toBe(second.minDelay);
    expect(first.slackTime).toBeCloseTo(30 - first.maxDelay, 9);
    expect(Number.isFinite(first.maxDelay)).toBe(true);
    expect(Number.isFinite(first.minDelay)).toBe(true);
  });
});

describe('deterministic congestion-guided routing', () => {
  it('modern.ts contains no random sampling', () => {
    expect(source('src/lib/algorithms/routing/modern.ts')).not.toMatch(/Math\.random/);
  });

  it('runGNNRouting is deterministic and reports measured metrics', () => {
    const cells = makeCells(6).map((c, i) => ({ ...c, position: { x: i * 20, y: 10 } }));
    const nets = makeNets();
    const first = withoutMathRandom(() =>
      runGNNRouting(cells, nets, CHIP_W, CHIP_H, { gnnLayers: 3, iterations: 5 })
    );
    const second = runGNNRouting(cells, nets, CHIP_W, CHIP_H, { gnnLayers: 3, iterations: 5 });

    expect(first.routes).toEqual(second.routes);
    expect(first.metrics.totalWirelength).toBeCloseTo(second.metrics.totalWirelength, 9);
    expect(first.metrics.viaCount).toBe(second.metrics.viaCount);
    expect(first.metrics.overflowCount).toBe(second.metrics.overflowCount);

    expect(first.routes).toHaveLength(nets.length);
    expect(Number.isFinite(first.metrics.totalWirelength)).toBe(true);
    expect(first.metrics.totalWirelength).toBeGreaterThan(0);
    expect(first.metrics.viaCount).toBeGreaterThanOrEqual(0);
    expect(first.metrics.overflowCount).toBeGreaterThanOrEqual(0);
    expect(first.metrics.convergence).toBeGreaterThanOrEqual(0);
    expect(first.metrics.convergence).toBeLessThanOrEqual(1);
  });
});

describe('deterministic industrial placement', () => {
  it('industrial.ts contains no random sampling', () => {
    expect(source('src/lib/algorithms/placement/industrial.ts')).not.toMatch(/Math\.random/);
  });

  it('runEPlace, runNTUPlace and runMPL are reproducible and report real overlap', () => {
    const cells = makeCells(6);
    const nets = makeNets();

    const eplace1 = withoutMathRandom(() =>
      runEPlace(cells, nets, CHIP_W, CHIP_H, { iterations: 25 })
    );
    const eplace2 = runEPlace(cells, nets, CHIP_W, CHIP_H, { iterations: 25 });
    expect(positionsOf(eplace1.cells)).toEqual(positionsOf(eplace2.cells));
    expect(eplace1.convergenceData).toHaveLength(25);
    expect(eplace1.overlap).toBeCloseTo(overlapArea(eplace1.cells), 6);

    const ntu1 = withoutMathRandom(() =>
      runNTUPlace(cells, nets, CHIP_W, CHIP_H, { iterations: 15 })
    );
    const ntu2 = runNTUPlace(cells, nets, CHIP_W, CHIP_H, { iterations: 15 });
    expect(positionsOf(ntu1.cells)).toEqual(positionsOf(ntu2.cells));
    expect(ntu1.overlap).toBeCloseTo(overlapArea(ntu1.cells), 6);

    const mpl1 = withoutMathRandom(() => runMPL(cells, nets, CHIP_W, CHIP_H));
    const mpl2 = runMPL(cells, nets, CHIP_W, CHIP_H);
    expect(positionsOf(mpl1.cells)).toEqual(positionsOf(mpl2.cells));
    expect(mpl1.overlap).toBeCloseTo(overlapArea(mpl1.cells), 6);

    for (const result of [eplace1, ntu1, mpl1]) {
      expect(result.success).toBe(true);
      expect(Number.isFinite(result.totalWirelength)).toBe(true);
      expect(Number.isFinite(result.overlap)).toBe(true);
      expect(result.overlap).toBeGreaterThanOrEqual(0);
      for (const cell of result.cells) {
        expect(Number.isFinite(cell.position!.x)).toBe(true);
        expect(Number.isFinite(cell.position!.y)).toBe(true);
      }
    }
  });

  it('runCapo is deterministic and respects obstacles and regions', () => {
    const cells = makeCells(4);
    const nets = makeNets();
    const options = {
      obstacles: [{ x: 0, y: 0, width: 40, height: 40 }],
      regions: [{ x: 100, y: 100, width: 80, height: 80, cells: ['c1'] }],
    };

    const first = withoutMathRandom(() => runCapo(cells, nets, CHIP_W, CHIP_H, options));
    const second = runCapo(cells, nets, CHIP_W, CHIP_H, options);
    expect(positionsOf(first.cells)).toEqual(positionsOf(second.cells));

    for (const cell of first.cells) {
      const p = cell.position!;
      // no overlap with the obstacle
      const hitsObstacle =
        p.x < 40 && p.x + cell.width > 0 && p.y < 40 && p.y + cell.height > 0;
      expect(hitsObstacle).toBe(false);
    }

    const regionCell = first.cells.find((c) => c.id === 'c1')!;
    expect(regionCell.position!.x).toBeGreaterThanOrEqual(100);
    expect(regionCell.position!.y).toBeGreaterThanOrEqual(100);
    expect(regionCell.position!.x + regionCell.width).toBeLessThanOrEqual(180);
    expect(regionCell.position!.y + regionCell.height).toBeLessThanOrEqual(180);

    // The deterministic first-fit packing keeps cells from overlapping.
    expect(first.overlap).toBeCloseTo(overlapArea(first.cells), 6);
  });
});

describe('deterministic floorplanning / clock tree helpers', () => {
  it('sequencePairFloorplanning is deterministic and uses the sequence pair', () => {
    expect(source('src/lib/algorithms/floorplanning.ts')).not.toMatch(/Math\.random/);

    const params = {
      algorithm: FloorplanningAlgorithm.SEQUENCE_PAIR,
      chipWidth: CHIP_W,
      chipHeight: CHIP_H,
      blocks: makeCells(4).map((c) => ({ ...c, type: 'macro' as const })),
    };
    const first = withoutMathRandom(() => sequencePairFloorplanning(params));
    const second = sequencePairFloorplanning(params);

    expect(positionsOf(first.blocks)).toEqual(positionsOf(second.blocks));
    expect(first.utilization).toBeGreaterThan(0);
    expect(first.utilization).toBeLessThanOrEqual(1);
    expect(first.deadSpace).toBeCloseTo(
      first.area - first.blocks.reduce((sum, b) => sum + b.width * b.height, 0),
      6
    );
    for (const block of first.blocks) {
      expect(block.position!.x).toBeGreaterThanOrEqual(0);
      expect(block.position!.y).toBeGreaterThanOrEqual(0);
    }
    // Reversed sequence pair => a single column, no overlaps.
    expect(overlapArea(first.blocks)).toBe(0);
  });

  it('clock tree node ids are deterministic (no random suffixes)', () => {
    expect(source('src/lib/algorithms/clocktree.ts')).not.toMatch(/Math\.random/);

    const params = {
      algorithm: ClockTreeAlgorithm.H_TREE,
      clockSource: { x: 100, y: 100 },
      sinks: [
        { x: 20, y: 20 },
        { x: 180, y: 20 },
        { x: 20, y: 180 },
        { x: 180, y: 180 },
      ],
      chipWidth: CHIP_W,
      chipHeight: CHIP_H,
    };

    const tree1 = withoutMathRandom(() => hTreeClock(params));
    const tree2 = hTreeClock(params);
    expect(treeShape(tree1.root)).toEqual(treeShape(tree2.root));

    const dme1 = withoutMathRandom(() => dmeAlgorithm(params));
    const dme2 = dmeAlgorithm(params);
    expect(treeShape(dme1.root)).toEqual(treeShape(dme2.root));
  });
});
