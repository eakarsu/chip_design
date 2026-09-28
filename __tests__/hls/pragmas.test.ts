/** @jest-environment node */

import { parseKernel, type KernelIR } from '@/lib/hls/kernel';
import { estimateDesignPoint } from '@/lib/hls/estimator';
import {
  DEFAULT_PRAGMA_OPTIONS,
  MAX_DESIGN_SPACE_POINTS,
  enumerateDesignSpace,
  exploreDesignSpace,
  normalizeDesignPoint,
  rankDesignPoints,
  resolvePragmaOptions,
} from '@/lib/hls/pragmas';

const vecadd: KernelIR = parseKernel(`
  void vecadd(int a[64], int b[64], int c[64], int N = 64) {
    for (int i = 0; i < N; i++) { c[i] = a[i] + b[i]; }
  }
`);

const matmul: KernelIR = parseKernel(`
  void mm(int a[8][8], int b[8][8], int acc[8][8], int K = 8) {
    for (int i = 0; i < 8; i++) {
      for (int j = 0; j < 8; j++) {
        for (int k = 0; k < K; k++) { acc[i][j] += a[i][k] * b[k][j]; }
      }
    }
  }
`);

describe('pragma design-space enumeration', () => {
  it('enumerates the full space for a single loop and labels it as workspace-only', () => {
    const space = enumerateDesignSpace(vecadd);
    expect(space.label).toContain('analytical design-space enumeration');
    expect(space.totalCombinations).toBe(3 * 3 * 3);
    expect(space.returned).toBe(27);
    expect(space.sampled).toBe(false);
    expect(space.notes.join(' ')).toContain('not consumed by any commercial HLS tool');
    expect(space.points[0].pragmaKey).toBe('loop_0:p1,i1,u1,t1');
    expect(space.points.every((point) => point.loopPragmas[0].tileable === false)).toBe(true);
    expect(space.points.every((point) => point.loopPragmas[0].tileFactor === 1)).toBe(true);
  });

  it('only offers tiling on loops that contain nested loops', () => {
    const space = enumerateDesignSpace(matmul, { maxPoints: MAX_DESIGN_SPACE_POINTS });
    expect(space.totalCombinations).toBe(3 * 3 * 3 * 3 * (3 * 3 * 3 * 3) * (3 * 3 * 3));
    const first = space.points[0];
    expect(first.loopPragmas.map((pragma) => pragma.tileable)).toEqual([true, true, false]);
    expect(first.directives.some((line) => line.includes('TILE loop=loop_2'))).toBe(false);
    expect(first.directives.some((line) => line.includes('TILE loop=loop_0'))).toBe(true);
  });

  it('caps the space deterministically with a stride sample', () => {
    const options = {
      parallelFactors: [1, 2, 4, 8],
      pipelineIIs: [1, 2, 4, 8],
      unrollFactors: [1, 2, 4, 8],
      maxPoints: 100,
    };
    const first = enumerateDesignSpace(vecadd, options);
    const second = enumerateDesignSpace(vecadd, options);
    expect(first.totalCombinations).toBe(64);
    expect(first.sampled).toBe(false);
    expect(first.samplingStride).toBe(1);
    expect(first.returned).toBe(64);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));

    const wide = enumerateDesignSpace(vecadd, { ...options, maxPoints: 10 });
    expect(wide.sampled).toBe(true);
    expect(wide.returned).toBeLessThanOrEqual(10);
    expect(wide.returned).toBe(10);
    expect(wide.samplingStride).toBe(Math.ceil(wide.totalCombinations / 10));
    expect(JSON.stringify(wide)).toBe(JSON.stringify(enumerateDesignSpace(vecadd, { ...options, maxPoints: 10 })));
  });

  it('clamps maxPoints to the documented bound and rejects bad factors', () => {
    expect(resolvePragmaOptions({ maxPoints: 10_000_000 }).maxPoints).toBe(MAX_DESIGN_SPACE_POINTS);
    expect(resolvePragmaOptions({ parallelFactors: [4, 1, 2, 2] }).parallelFactors).toEqual([1, 2, 4]);
    expect(() => resolvePragmaOptions({ unrollFactors: [0] })).toThrow(/between 1 and 64/);
    expect(() => resolvePragmaOptions({ pipelineIIs: [] })).toThrow(/must not be empty/);
    expect(DEFAULT_PRAGMA_OPTIONS.maxPoints).toBe(5000);
  });

  it('returns a single straight-line point for a kernel without loops', () => {
    const straight = parseKernel('void k(int x[4]) { x[0] = 7; }');
    const space = enumerateDesignSpace(straight);
    expect(space.points).toHaveLength(1);
    expect(space.points[0].pragmaKey).toBe('straight-line');
    expect(space.notes.join(' ')).toContain('no loops');
  });
});

describe('design point normalization', () => {
  it('fills missing loops with identity pragmas and emits directives', () => {
    const point = normalizeDesignPoint(vecadd, [{ loopId: 'loop_0', parallelFactor: 2, unrollFactor: 4 }]);
    expect(point.loopPragmas).toEqual([
      { loopId: 'loop_0', tileable: false, parallelFactor: 2, pipelineII: 1, unrollFactor: 4, tileFactor: 1 },
    ]);
    expect(point.directives).toContain('#pragma HLS UNROLL loop=loop_0 factor=4');
  });

  it('rejects unknown loop ids and out-of-range factors with readable errors', () => {
    expect(() => normalizeDesignPoint(vecadd, [{ loopId: 'loop_9' }])).toThrow(/unknown loopId "loop_9"/);
    expect(() => normalizeDesignPoint(vecadd, [{ loopId: 'loop_0', pipelineII: 0 }])).toThrow(/between 1 and 64/);
  });
});

describe('ranking', () => {
  it('marks Pareto points and respects objective weights', () => {
    const space = enumerateDesignSpace(vecadd);
    const latencyFirst = rankDesignPoints(vecadd, space.points, { latency: 1, area: 0, memory: 0 });
    const areaFirst = rankDesignPoints(vecadd, space.points, { latency: 0, area: 1, memory: 0 });

    expect(latencyFirst[0].estimate.latencyCycles).toBe(Math.min(...latencyFirst.map((entry) => entry.estimate.latencyCycles)));
    expect(areaFirst[0].estimate.scores.area).toBe(Math.min(...areaFirst.map((entry) => entry.estimate.scores.area)));
    expect(latencyFirst[0].weightedScore).toBeLessThanOrEqual(latencyFirst[latencyFirst.length - 1].weightedScore);
    expect(latencyFirst.some((entry) => entry.pareto)).toBe(true);
    expect(latencyFirst.every((entry) => entry.rank >= 1)).toBe(true);
    expect(latencyFirst.findIndex((entry) => entry.rank === 1)).toBe(0);
    expect(latencyFirst.every((entry) => entry.estimate.label === 'analytical estimate, not synthesis evidence')).toBe(true);
  });

  it('rejects an all-zero weight vector', () => {
    const space = enumerateDesignSpace(vecadd, { maxPoints: 5 });
    expect(() => rankDesignPoints(vecadd, space.points, { latency: 0, area: 0, memory: 0, power: 0 })).toThrow(
      /at least one objective weight/,
    );
  });

  it('explores the space and ranks every enumerated point', () => {
    const { space, ranked } = exploreDesignSpace(vecadd, { maxPoints: 6 });
    expect(ranked).toHaveLength(space.points.length);
    expect(ranked.map((entry) => entry.id).sort()).toEqual(space.points.map((point) => point.id).sort());
    const identity = ranked.find((entry) => entry.pragmaKey === 'loop_0:p1,i1,u1,t1');
    expect(identity?.estimate.latencyCycles).toBe(estimateDesignPoint(vecadd, identity!).latencyCycles);
  });
});
