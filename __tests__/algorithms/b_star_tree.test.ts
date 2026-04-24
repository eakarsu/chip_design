/**
 * @jest-environment node
 */
import { bStarTreeFloorplanning } from '@/lib/algorithms/b_star_tree';
import {
  FloorplanningAlgorithm,
  FloorplanningParams,
  Cell,
} from '@/types/algorithms';

function blocks(sizes: [number, number][]): Cell[] {
  return sizes.map(([w, h], i) => ({
    id: `b${i}`, name: `b${i}`,
    width: w, height: h, type: 'standard',
    pins: [],
  }));
}

function params(bs: Cell[], chip: { w: number; h: number }): FloorplanningParams {
  return {
    algorithm: FloorplanningAlgorithm.B_STAR_TREE,
    chipWidth: chip.w,
    chipHeight: chip.h,
    blocks: bs,
  };
}

function blocksOverlap(a: Cell, b: Cell): boolean {
  const ax = a.position!.x, ay = a.position!.y;
  const bx = b.position!.x, by = b.position!.y;
  return ax < bx + b.width && bx < ax + a.width
      && ay < by + b.height && by < ay + a.height;
}

describe('bStarTreeFloorplanning', () => {
  it('places every input block', () => {
    const r = bStarTreeFloorplanning(params(
      blocks([[20, 20], [30, 10], [10, 40], [25, 25]]),
      { w: 200, h: 200 },
    ));
    expect(r.success).toBe(true);
    expect(r.blocks).toHaveLength(4);
    for (const b of r.blocks) expect(b.position).toBeDefined();
  });

  it('produces non-overlapping placements', () => {
    const r = bStarTreeFloorplanning(params(
      blocks([[40, 30], [20, 40], [30, 30], [25, 20], [15, 35]]),
      { w: 500, h: 500 },
    ));
    for (let i = 0; i < r.blocks.length; i++) {
      for (let j = i + 1; j < r.blocks.length; j++) {
        expect(blocksOverlap(r.blocks[i], r.blocks[j])).toBe(false);
      }
    }
  });

  it('utilization is in (0, 1]', () => {
    const r = bStarTreeFloorplanning(params(
      blocks([[10, 10], [10, 10], [20, 20]]),
      { w: 100, h: 100 },
    ));
    expect(r.utilization).toBeGreaterThan(0);
    expect(r.utilization).toBeLessThanOrEqual(1);
  });

  it('reports area >= sum of block areas', () => {
    const bs = blocks([[20, 20], [30, 30], [40, 10]]);
    const sumArea = bs.reduce((s, b) => s + b.width * b.height, 0);
    const r = bStarTreeFloorplanning(params(bs, { w: 500, h: 500 }));
    expect(r.area).toBeGreaterThanOrEqual(sumArea);
  });
});
