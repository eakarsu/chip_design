/** @jest-environment node */

import { parseKernel, type KernelIR } from '@/lib/hls/kernel';
import { normalizeDesignPoint, type DesignPoint } from '@/lib/hls/pragmas';
import {
  DEFAULT_ESTIMATE_WEIGHTS,
  ESTIMATOR_ASSUMPTIONS,
  ESTIMATOR_LABEL,
  estimateDesignPoint,
  estimateDesignPoints,
  normalizeWeights,
  weightedScore,
} from '@/lib/hls/estimator';

const vecadd: KernelIR = parseKernel(`
  void vecadd(int a[64], int b[64], int c[64], int N = 64) {
    for (int i = 0; i < N; i++) { c[i] = a[i] + b[i]; }
  }
`);

const multiply: KernelIR = parseKernel(`
  void gather(int a[64], int b[64], int out[64], int N = 64) {
    for (int i = 0; i < N; i++) { out[i] = a[i] * b[i] + 1; }
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

const point = (kernel: KernelIR, pragma: { parallelFactor?: number; unrollFactor?: number; pipelineII?: number; tileFactor?: number }): DesignPoint =>
  normalizeDesignPoint(kernel, [{ loopId: kernel.loops[0].id, ...pragma }]);

describe('estimateDesignPoint', () => {
  it('labels every estimate as analytical and lists explicit assumptions', () => {
    const estimate = estimateDesignPoint(vecadd, point(vecadd, {}));
    expect(estimate.label).toBe(ESTIMATOR_LABEL);
    expect(estimate.label).toContain('not synthesis evidence');
    expect(estimate.assumptions.length).toBeGreaterThanOrEqual(10);
    expect(estimate.assumptions.join(' ')).toContain('no dependence analysis');
    expect(estimate.assumptions.join(' ')).toContain('trip counts are those resolved constants');
    expect(estimate.caveats.join(' ')).toContain('no synthesis');
    expect(ESTIMATOR_ASSUMPTIONS.length).toBe(estimate.assumptions.length);
    expect(estimate.latencyCycles).toBeGreaterThan(0);
    expect(estimate.memoryTrafficBytes).toBeGreaterThan(0);
  });

  it('models latency and resources from the resolved trip counts', () => {
    const estimate = estimateDesignPoint(vecadd, point(vecadd, {}));
    // 64 iterations, one add per iteration, II=1, 2-cycle fill/drain, 1 done cycle.
    expect(estimate.latencyCycles).toBe(64 * 1 + 2 + 1);
    expect(estimate.loopBreakdown).toHaveLength(1);
    expect(estimate.loopBreakdown[0]).toMatchObject({ iterations: 64, lanes: 1, ownOpCount: 1 });
    expect(estimate.resources.dsp).toBe(0);
    expect(estimate.resources.lut).toBeGreaterThanOrEqual(64);
    expect(estimate.resources.bram).toBe(3); // a, b, c each fit in one 4 KiB block
  });

  it('monotonically reduces latency and raises resources as parallelism grows', () => {
    const estimates = [1, 2, 4, 8].map((parallelFactor) =>
      estimateDesignPoint(vecadd, point(vecadd, { parallelFactor })),
    );
    for (let index = 1; index < estimates.length; index += 1) {
      expect(estimates[index].latencyCycles).toBeLessThan(estimates[index - 1].latencyCycles);
      expect(estimates[index].resources.lut).toBeGreaterThan(estimates[index - 1].resources.lut);
      expect(estimates[index].resources.ff).toBeGreaterThan(estimates[index - 1].resources.ff);
    }
  });

  it('monotonically reduces latency and raises resources as unrolling grows', () => {
    const estimates = [1, 2, 4].map((unrollFactor) =>
      estimateDesignPoint(vecadd, point(vecadd, { unrollFactor })),
    );
    for (let index = 1; index < estimates.length; index += 1) {
      expect(estimates[index].latencyCycles).toBeLessThanOrEqual(estimates[index - 1].latencyCycles);
      expect(estimates[index].resources.lut).toBeGreaterThanOrEqual(estimates[index - 1].resources.lut);
    }
    expect(estimates[2].latencyCycles).toBeLessThan(estimates[0].latencyCycles);
  });

  it('counts one DSP per multiply replication', () => {
    const identity = estimateDesignPoint(multiply, point(multiply, {}));
    const parallel = estimateDesignPoint(multiply, point(multiply, { parallelFactor: 4 }));
    expect(identity.resources.dsp).toBe(1);
    expect(parallel.resources.dsp).toBe(4);
  });

  it('caps lanes at the trip count so extra parallelism cannot claim unbounded replication', () => {
    const small = parseKernel('void k(int a[4], int b[4], int N = 4) { for (int i = 0; i < N; i++) { b[i] = a[i] + 1; } }');
    const estimate = estimateDesignPoint(small, point(small, { parallelFactor: 64, unrollFactor: 64 }));
    expect(estimate.loopBreakdown[0].lanes).toBe(4);
    expect(estimate.resources.lut).toBeLessThan(4 * 64 * 48);
    expect(estimate.latencyCycles).toBeGreaterThan(0);
  });

  it('reduces modelled memory traffic when an enclosing loop is tiled', () => {
    const untiled = estimateDesignPoint(matmul, normalizeDesignPoint(matmul, [{ loopId: 'loop_0', tileFactor: 1 }]));
    const tiled = estimateDesignPoint(matmul, normalizeDesignPoint(matmul, [{ loopId: 'loop_0', tileFactor: 4 }]));
    expect(tiled.memoryTrafficBytes).toBeLessThan(untiled.memoryTrafficBytes);
    expect(untiled.memoryTrafficElements).toBeGreaterThan(0);
  });

  it('reports the loop nest in the breakdown in parse order with nested inner cycles', () => {
    const estimates = estimateDesignPoints(matmul, [normalizeDesignPoint(matmul, [])]);
    expect(estimates[0].loopBreakdown.map((entry) => entry.loopId)).toEqual(['loop_0', 'loop_1', 'loop_2']);
    expect(estimates[0].loopBreakdown[0].innerCycles).toBeGreaterThan(0);
    expect(estimates[0].loopBreakdown[2].innerCycles).toBe(0);
    expect(estimates[0].loopBreakdown[1].innerCycles).toBeGreaterThan(0);
    expect(estimates[0].loopBreakdown[0].loopCycles).toBeGreaterThan(0);
  });

  it('keeps scores unitless-relative and weights validated', () => {
    const estimate = estimateDesignPoint(vecadd, point(vecadd, { pipelineII: 2 }));
    expect(estimate.scores.latency).toBe(estimate.latencyCycles);
    expect(estimate.scores.area).toBeGreaterThan(0);
    expect(estimate.scores.power).toBeGreaterThan(0);
    expect(estimate.activity).toBeGreaterThan(0);
    expect(estimate.activity).toBeLessThanOrEqual(1);
    expect(weightedScore(estimate, DEFAULT_ESTIMATE_WEIGHTS)).toBeGreaterThan(0);
    expect(normalizeWeights({ latency: 1 }).latency).toBe(1);
    expect(() => normalizeWeights({ latency: -1 })).toThrow(/finite number >= 0/);
  });
});
