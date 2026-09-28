/**
 * @jest-environment node
 *
 * Polyhedral/tiling explorer tests: enumeration bounds + determinism,
 * dependence-based order legality, Pareto dominance correctness, and the
 * documented memory-traffic monotonicity with tile size (including the
 * fast-memory spill boundary).
 */
import {
  analyzeLoopNest,
  dependenceDistanceVectors,
  enumerateLegalOrders,
  evaluateScheduleMetrics,
  isLegalOrder,
  normalizeLoopNest,
  paretoFront,
  renderTransformedLoopNest,
  tileFactorCandidates,
  type LoopNestInput,
  type PolyhedralSchedule,
} from '@/lib/accelerator/polyhedral';

const MATMUL_8: LoopNestInput = {
  loops: [
    { name: 'i', lower: 0, upper: 8 },
    { name: 'j', lower: 0, upper: 8 },
    { name: 'k', lower: 0, upper: 8 },
  ],
  accesses: [
    { array: 'C', kind: 'write', indices: [{ loop: 'i' }, { loop: 'j' }] },
    { array: 'A', kind: 'read', indices: [{ loop: 'i' }, { loop: 'k' }] },
    { array: 'B', kind: 'read', indices: [{ loop: 'k' }, { loop: 'j' }] },
  ],
  lineBytes: 64,
  fastMemoryBytes: 4096,
  maxCandidates: 24,
};

const MATMUL_32 = {
  loops: [
    { name: 'i', lower: 0, upper: 32 },
    { name: 'j', lower: 0, upper: 32 },
    { name: 'k', lower: 0, upper: 32 },
  ],
  accesses: [
    { array: 'C', kind: 'write' as const, indices: [{ loop: 'i' }, { loop: 'j' }] },
    { array: 'A', kind: 'read' as const, indices: [{ loop: 'i' }, { loop: 'k' }] },
    { array: 'B', kind: 'read' as const, indices: [{ loop: 'k' }, { loop: 'j' }] },
  ],
};

const MATMUL_5 = {
  loops: [
    { name: 'i', lower: 0, upper: 5 },
    { name: 'j', lower: 0, upper: 5 },
    { name: 'k', lower: 0, upper: 5 },
  ],
  accesses: [
    { array: 'C', kind: 'write' as const, indices: [{ loop: 'i' }, { loop: 'j' }] },
    { array: 'A', kind: 'read' as const, indices: [{ loop: 'i' }, { loop: 'k' }] },
    { array: 'B', kind: 'read' as const, indices: [{ loop: 'k' }, { loop: 'j' }] },
  ],
};

const syntheticSchedule = (id: string, traffic: number, workingSet: number, tiles: number): PolyhedralSchedule => ({
  id,
  loopOrder: ['i', 'j', 'k'],
  tileFactors: {},
  tileShape: [],
  transformedListing: '',
  tileCount: tiles,
  tileIterations: 1,
  totalIterations: 1,
  l2TrafficBytes: traffic,
  requestedBytes: 0,
  linesFromL2: 0,
  linesTouched: 0,
  accessesPerLine: 0,
  requestBytesPerL2Byte: 0,
  maxWorkingSetBytes: workingSet,
  spillPasses: 1,
  fitsFastMemory: true,
  arithmeticIntensityOpsPerByte: 0,
  dominated: false,
  paretoRank: null,
});

describe('polyhedral — tiling enumeration bounds and determinism', () => {
  it('is deterministic and bounded by maxCandidates', () => {
    const first = analyzeLoopNest(MATMUL_8);
    const second = analyzeLoopNest(MATMUL_8);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(first.schedules.length).toBeLessThanOrEqual(24);
    expect(first.schedules.length).toBe(first.evaluatedCount);
    expect(first.candidateCount).toBeLessThanOrEqual(24);
    // ids are unique
    expect(new Set(first.schedules.map((s) => s.id)).size).toBe(first.schedules.length);
  });

  it('only emits factors from the deterministic per-loop candidate set', () => {
    const analysis = analyzeLoopNest(MATMUL_8);
    const allowed = new Map([
      ['i', tileFactorCandidates(8)],
      ['j', tileFactorCandidates(8)],
      ['k', tileFactorCandidates(8)],
    ]);
    expect([...allowed.values()]).toEqual([
      [1, 2, 4, 8],
      [1, 2, 4, 8],
      [1, 2, 4, 8],
    ]);
    for (const schedule of analysis.schedules) {
      for (const [name, factor] of Object.entries(schedule.tileFactors)) {
        expect(allowed.get(name)).toContain(factor);
      }
      expect(schedule.tileCount).toBeGreaterThan(0);
      expect(schedule.l2TrafficBytes).toBeGreaterThan(0);
    }
  });

  it('respects maxCandidates = 1 and marks truncation', () => {
    const analysis = analyzeLoopNest({ ...MATMUL_8, maxCandidates: 1 });
    expect(analysis.schedules).toHaveLength(1);
    expect(analysis.truncated).toBe(true);
  });

  it('enumerates every legal loop order and excludes illegal ones', () => {
    const analysis = analyzeLoopNest(MATMUL_8);
    expect(analysis.legalOrders).toHaveLength(6); // matmul: all permutations are legal
    const permissionSet = new Set(analysis.legalOrders.map((order) => order.join(',')));
    expect(permissionSet.has('i,j,k')).toBe(true);
    expect(permissionSet.has('k,j,i')).toBe(true);

    // A[i][j] = A[i+1][j-1] * 2 carries a (1,-1) distance: the swap is illegal.
    const carried: LoopNestInput = {
      loops: [
        { name: 'i', lower: 0, upper: 6 },
        { name: 'j', lower: 0, upper: 6 },
      ],
      accesses: [
        { array: 'A', kind: 'write', indices: [{ loop: 'i' }, { loop: 'j' }] },
        {
          array: 'A',
          kind: 'read',
          indices: [{ loop: 'i', coeff: 1, offset: 1 }, { loop: 'j', coeff: 1, offset: -1 }],
        },
      ],
      maxCandidates: 16,
    };
    const nest = normalizeLoopNest(carried);
    const vectors = dependenceDistanceVectors(nest);
    expect(vectors.map((v) => v.delta)).toEqual([[1, -1]]);
    expect(isLegalOrder(vectors, [0, 1])).toBe(true);
    expect(isLegalOrder(vectors, [1, 0])).toBe(false);
    expect(enumerateLegalOrders(vectors, 2)).toEqual([[0, 1]]);
    const analysisCarried = analyzeLoopNest(carried);
    expect(analysisCarried.legalOrders).toEqual([['i', 'j']]);
    expect(analysisCarried.schedules.every((s) => s.loopOrder.join(',') === 'i,j')).toBe(true);
  });

  it('renders a human-readable transformed nest with boundary clamping', () => {
    const nest = normalizeLoopNest(MATMUL_32);
    const listing = renderTransformedLoopNest(nest, [0, 1, 2], [8, 8, 8]);
    expect(listing).toContain('for t_i in 0 .. 3:');
    expect(listing).toContain('for i in t_i*8 .. min(t_i*8+8, 32) - 1:');
    expect(listing).toContain('read  A[i][k]');
    expect(listing).toContain('read  B[k][j]');
    expect(listing).toContain('write C[i][j]');
    const untiled = renderTransformedLoopNest(nest, [0, 1, 2], [1, 1, 1]);
    expect(untiled).not.toContain('for t_i');
    expect(untiled).toContain('for k in 0 .. 31:');
  });
});

describe('polyhedral — Pareto dominance', () => {
  it('computes a correct front on synthetic schedules', () => {
    const a = syntheticSchedule('a', 100, 10, 5);
    const b = syntheticSchedule('b', 200, 5, 10);
    const c = syntheticSchedule('c', 300, 20, 4);
    const d = syntheticSchedule('d', 150, 10, 4);
    const front = paretoFront([a, b, c, d]);
    // a dominates c and d (equal or better on all three, strictly better on traffic/tiles);
    // b is non-dominated (best working set and tile count, worst traffic).
    expect(front.sort()).toEqual(['a', 'b']);
  });

  it('marks exactly the non-dominated schedules of the analysis, verified independently', () => {
    const analysis = analyzeLoopNest(MATMUL_8);
    const dominates = (x: PolyhedralSchedule, y: PolyhedralSchedule) =>
      x.l2TrafficBytes <= y.l2TrafficBytes &&
      x.maxWorkingSetBytes <= y.maxWorkingSetBytes &&
      x.tileCount >= y.tileCount &&
      (x.l2TrafficBytes < y.l2TrafficBytes || x.maxWorkingSetBytes < y.maxWorkingSetBytes || x.tileCount > y.tileCount);

    const paretoIds = new Set(analysis.pareto);
    expect(paretoIds.size).toBeGreaterThan(0);
    for (const schedule of analysis.schedules) {
      const dominatedBySomeone = analysis.schedules.some((other) => other.id !== schedule.id && dominates(other, schedule));
      if (paretoIds.has(schedule.id)) {
        expect(dominatedBySomeone).toBe(false);
        expect(schedule.dominated).toBe(false);
        expect(schedule.paretoRank).not.toBeNull();
      } else {
        expect(dominatedBySomeone).toBe(true);
        expect(schedule.dominated).toBe(true);
        expect(schedule.paretoRank).toBeNull();
      }
    }
  });
});

describe('polyhedral — memory traffic and monotonicity', () => {
  it('matches hand-computed traffic for the matmul tiles (32^3, 64 B lines, 4 B elements)', () => {
    const nest = normalizeLoopNest({ ...MATMUL_32, fastMemoryBytes: 2048 });
    // order i,j,k with k tiled by f: C 1 line + A ceil(4f/64) lines + B the same.
    const expectations: [number, number, number, number][] = [
      // f, tiles, lines per tile, total bytes
      [1, 32 * 32 * 32, 3, 32 * 32 * 32 * 3 * 64],
      [2, 32 * 32 * 16, 3, 32 * 32 * 16 * 3 * 64],
      [4, 32 * 32 * 8, 3, 32 * 32 * 8 * 3 * 64],
      [8, 32 * 32 * 4, 3, 32 * 32 * 4 * 3 * 64],
      [16, 32 * 32 * 2, 3, 32 * 32 * 2 * 3 * 64],
      [32, 32 * 32 * 1, 5, 32 * 32 * 1 * 5 * 64],
    ];
    for (const [f, tiles, lines, bytes] of expectations) {
      const metrics = evaluateScheduleMetrics(nest, [0, 1, 2], [1, 1, f]);
      expect(metrics.tileCount).toBe(tiles);
      expect(metrics.linesTouched).toBe(tiles * lines);
      expect(metrics.l2TrafficBytes).toBe(bytes);
      expect(metrics.spillPasses).toBe(1);
    }
  });

  it('is monotonically non-increasing with tile size while tiles fit the fast memory', () => {
    const nest = normalizeLoopNest({ ...MATMUL_32, fastMemoryBytes: 2048 });
    const factors = [1, 2, 4, 8, 16, 32];
    const traffic = factors.map((f) => evaluateScheduleMetrics(nest, [0, 1, 2], [1, 1, f]).l2TrafficBytes);
    for (let i = 1; i < traffic.length; i += 1) {
      expect(traffic[i]).toBeLessThanOrEqual(traffic[i - 1]);
    }
    // Strictly decreasing overall: the untiled nest must move much more traffic.
    expect(traffic[traffic.length - 1]).toBeLessThan(traffic[0]);
    // Also monotone for i / j tiling (same access structure, different dimension).
    const iTraffic = [1, 2, 4, 8].map((f) => evaluateScheduleMetrics(nest, [0, 1, 2], [f, 1, 1]).l2TrafficBytes);
    for (let i = 1; i < iTraffic.length; i += 1) {
      expect(iTraffic[i]).toBeLessThanOrEqual(iTraffic[i - 1]);
    }
  });

  it('turns traffic back up (U-curve) once a tile working set exceeds the fast memory', () => {
    const tight = normalizeLoopNest({ ...MATMUL_32, fastMemoryBytes: 256 });
    const f16 = evaluateScheduleMetrics(tight, [0, 1, 2], [1, 1, 16]);
    const f32 = evaluateScheduleMetrics(tight, [0, 1, 2], [1, 1, 32]);
    // working sets: f=16 -> 4 + 64 + 64 = 132 B (fits), f=32 -> 4 + 128 + 128 = 260 B (spills once)
    expect(f16.maxWorkingSetBytes).toBe(132);
    expect(f32.maxWorkingSetBytes).toBe(260);
    expect(f16.spillPasses).toBe(1);
    expect(f32.spillPasses).toBe(2);
    expect(f32.l2TrafficBytes).toBe(327680 * 2);
    expect(f32.l2TrafficBytes).toBeGreaterThan(f16.l2TrafficBytes);
  });

  it('costs clamped boundary tiles exactly (extent 5, non-dividing factors)', () => {
    const nest = normalizeLoopNest(MATMUL_5);
    const expectedTiles: [number, number][] = [
      [1, 5 * 5 * 5],
      [2, 5 * 5 * 3],
      [3, 5 * 5 * 2],
      [4, 5 * 5 * 2],
      [5, 5 * 5 * 1],
    ];
    const traffic = expectedTiles.map(([f, tiles]) => {
      const metrics = evaluateScheduleMetrics(nest, [0, 1, 2], [1, 1, f]);
      expect(metrics.tileCount).toBe(tiles); // ceil(5/f) on the k dimension
      return metrics.l2TrafficBytes;
    });
    for (let i = 1; i < traffic.length; i += 1) {
      expect(traffic[i]).toBeLessThanOrEqual(traffic[i - 1]);
    }
    expect(traffic[0]).toBe(5 * 5 * 5 * 3 * 64); // untiled: 1 line per access per iteration
  });

  it('documents the model assumptions and monotonicity in the notes', () => {
    const analysis = analyzeLoopNest(MATMUL_8);
    const text = analysis.notes.join('\n');
    expect(text).toMatch(/non-increasing in the tile factors/);
    expect(text).toMatch(/spill/);
    expect(text).toMatch(/lineBytes=64/);
    expect(text).toMatch(/fastMemoryBytes=4096/);
    expect(analysis.arrayShapes.C.shape).toEqual([8, 8]);
    expect(analysis.arrayShapes.A.strides).toEqual([8, 1]);
  });
});
