/**
 * @jest-environment node
 */
import {
  paretoFrontier,
  dominates,
  bestByWeights,
  hypervolume,
  toVizPoints,
  Candidate,
} from '@/lib/algorithms/pareto';

function c(id: string, ...obj: number[]): Candidate {
  return { id, objectives: obj };
}

describe('dominates', () => {
  it('returns true when a is strictly better on at least one axis and not worse on others', () => {
    expect(dominates([1, 2], [1, 3])).toBe(true);
    expect(dominates([1, 2], [2, 3])).toBe(true);
  });
  it('returns false when equal', () => {
    expect(dominates([1, 2], [1, 2])).toBe(false);
  });
  it('returns false when worse on any axis', () => {
    expect(dominates([1, 5], [2, 4])).toBe(false);
  });
  it('throws on dimension mismatch', () => {
    expect(() => dominates([1], [1, 2])).toThrow(/dimension/);
  });
});

describe('paretoFrontier', () => {
  it('keeps only non-dominated points in 2D', () => {
    // Classic shape: a, b, c on the frontier; d dominated by a.
    const cands = [
      c('a', 1, 5),
      c('b', 2, 3),
      c('c', 4, 1),
      c('d', 3, 6), // dominated by b (2 < 3 and 3 < 6)
      c('e', 5, 2), // dominated by c (4 < 5 and 1 < 2)
    ];
    const r = paretoFrontier(cands);
    const ids = r.frontier.map(x => x.id).sort();
    expect(ids).toEqual(['a', 'b', 'c']);
    expect(r.dominated.map(x => x.id).sort()).toEqual(['d', 'e']);
  });

  it('records dominanceCount per candidate', () => {
    const cands = [
      c('best', 0, 0),
      c('mid', 5, 5),
      c('worst', 10, 10),
    ];
    const r = paretoFrontier(cands);
    expect(r.dominanceCount.best).toBe(0);
    expect(r.dominanceCount.mid).toBe(1);   // dominated by best
    expect(r.dominanceCount.worst).toBe(2); // dominated by best + mid
  });

  it('handles all-frontier case (mutually non-dominated)', () => {
    const cands = [c('a', 1, 4), c('b', 2, 3), c('c', 3, 2), c('d', 4, 1)];
    const r = paretoFrontier(cands);
    expect(r.frontier).toHaveLength(4);
    expect(r.dominated).toHaveLength(0);
  });

  it('empty input returns empty result', () => {
    const r = paretoFrontier([]);
    expect(r.frontier).toEqual([]);
    expect(r.dominated).toEqual([]);
  });
});

describe('bestByWeights', () => {
  it('picks the lower-cost option under equal weights', () => {
    const cands = [c('cheap', 1, 10), c('balanced', 5, 5), c('fast', 10, 1)];
    const best = bestByWeights(cands, [0.5, 0.5]);
    expect(best?.id).toBe('balanced');
  });

  it('respects weighting toward one axis', () => {
    const cands = [c('cheap', 1, 10), c('balanced', 5, 5), c('fast', 10, 1)];
    expect(bestByWeights(cands, [1, 0])?.id).toBe('cheap');
    expect(bestByWeights(cands, [0, 1])?.id).toBe('fast');
  });

  it('returns undefined on empty input', () => {
    expect(bestByWeights([], [1, 1])).toBeUndefined();
  });

  it('throws on weight/dim mismatch', () => {
    expect(() => bestByWeights([c('a', 1, 2)], [1])).toThrow(/weights/);
  });
});

describe('hypervolume', () => {
  it('2D: single point at origin against ref [1,1] yields area 1', () => {
    const hv = hypervolume([c('p', 0, 0)], [1, 1]);
    expect(hv).toBeCloseTo(1, 6);
  });

  it('2D: staircase frontier vs ref [10,10]', () => {
    // Points (1,9), (5,5), (9,1) — sweep area = 9 + 16 + 16 = 41.
    // Computed as: w=10-1=9, h=10-9=1 → 9; w=10-5=5, h=9-5=4 → 20; w=10-9=1, h=5-1=4 → 4.
    // Total = 9 + 20 + 4 = 33.
    const hv = hypervolume([c('a', 1, 9), c('b', 5, 5), c('c', 9, 1)], [10, 10]);
    expect(hv).toBeCloseTo(33, 6);
  });

  it('3D: single point at origin against ref [1,1,1] yields volume 1', () => {
    const hv = hypervolume([c('p', 0, 0, 0)], [1, 1, 1]);
    expect(hv).toBeCloseTo(1, 6);
  });

  it('returns 0 for empty frontier', () => {
    expect(hypervolume([], [1, 1])).toBe(0);
  });

  it('higher-dim falls back to monte carlo and is positive', () => {
    const cands = [c('a', 0, 0, 0, 0), c('b', 0.2, 0.2, 0.2, 0.2)];
    const hv = hypervolume(cands, [1, 1, 1, 1]);
    expect(hv).toBeGreaterThan(0);
    expect(hv).toBeLessThanOrEqual(1);
  });
});

describe('toVizPoints', () => {
  it('flags frontier points and copies dominanceCount', () => {
    const cands = [c('a', 1, 1), c('b', 2, 2)];
    const r = paretoFrontier(cands);
    const viz = toVizPoints(cands, r);
    const a = viz.find(v => v.id === 'a')!;
    const b = viz.find(v => v.id === 'b')!;
    expect(a.isFrontier).toBe(true);
    expect(a.dominatedBy).toBe(0);
    expect(b.isFrontier).toBe(false);
    expect(b.dominatedBy).toBe(1);
    expect(a.x).toBe(1);
    expect(a.y).toBe(1);
  });

  it('exposes z when 3D', () => {
    const cands = [c('a', 1, 2, 3)];
    const r = paretoFrontier(cands);
    const viz = toVizPoints(cands, r);
    expect(viz[0].z).toBe(3);
  });
});
