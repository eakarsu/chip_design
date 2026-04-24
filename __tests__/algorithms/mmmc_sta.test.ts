import {
  runMMMC, computeArrival, defaultCorners,
  Corner, TimingPath,
} from '@/lib/algorithms/mmmc_sta';

function simplePath(id: string, cellDelay: number, wireDelay: number, arcs = 3): TimingPath {
  return {
    id, required: 1000, launchDelay: 50, captureDelay: 50,
    arcs: Array.from({ length: arcs }, (_, i) => ({
      id: `${id}_a${i}`, from: `${id}_f${i}`, to: `${id}_t${i}`,
      cellDelay, wireDelay,
    })),
  };
}

describe('MMMC STA — arrival calculation', () => {
  it('sums launch + cell·derate + wire·derate along the path', () => {
    const p = simplePath('p1', 100, 50, 2);
    const corner: Corner = {
      id: 'c', mode: 'functional', process: 'tt', voltage: 0.9, temperature: 25,
      rcCorner: 'rc-typ', cellDerate: 1.5, wireDerate: 2.0, clockUncertainty: 0,
    };
    // launch + 2·(100·1.5 + 50·2.0) = 50 + 2·(150 + 100) = 50 + 500 = 550
    expect(computeArrival(p, corner)).toBe(550);
  });
});

describe('MMMC STA — corner sweep', () => {
  it('produces one row per (corner, path) in perPath', () => {
    const corners = defaultCorners();
    const paths = [simplePath('p1', 80, 20), simplePath('p2', 60, 15)];
    const r = runMMMC(corners, paths);
    expect(r.perPath).toHaveLength(corners.length * paths.length);
  });

  it('slow corner has worse slack than fast corner for the same path', () => {
    const corners = defaultCorners();
    const paths = [simplePath('p', 100, 30, 5)];
    const r = runMMMC(corners, paths);
    const slow = r.perPath.find(x => x.cornerId === 'ss_0p81_125')!;
    const fast = r.perPath.find(x => x.cornerId === 'ff_0p99_m40')!;
    expect(slow.slack).toBeLessThan(fast.slack);
  });

  it('per-corner summary reports WNS/TNS and worstPaths in ascending slack', () => {
    const corners = [defaultCorners()[0]]; // slow only
    const paths = [
      simplePath('a', 200, 50, 10), // very long
      simplePath('b', 50, 10, 2),
    ];
    const r = runMMMC(corners, paths, { worstN: 2 });
    const c0 = r.perCorner[0];
    expect(c0.worstPaths).toHaveLength(2);
    expect(c0.worstPaths[0].slack).toBeLessThanOrEqual(c0.worstPaths[1].slack);
    // WNS = worst slack across all paths at this corner.
    expect(c0.wns).toBe(c0.worstPaths[0].slack);
  });

  it('TNS aggregates only negative slacks', () => {
    const corner: Corner = {
      id: 'c', mode: 'functional', process: 'ss', voltage: 0.8, temperature: 125,
      rcCorner: 'c-worst', cellDerate: 2.0, wireDerate: 2.0, clockUncertainty: 100,
    };
    const paths = [
      simplePath('bad1', 300, 100, 5),   // definitely negative
      simplePath('ok',    1,   1, 1),    // likely positive
    ];
    const r = runMMMC([corner], paths);
    // Sum of only the negative slacks:
    const manualTns = r.perPath
      .filter(p => p.slack < 0)
      .reduce((s, p) => s + p.slack, 0);
    expect(r.totalTNS).toBeCloseTo(manualTns);
  });

  it('worstWNS identifies the (corner, path) with the smallest slack overall', () => {
    const corners = defaultCorners();
    const paths = [simplePath('p1', 50, 10), simplePath('longest', 400, 80, 15)];
    const r = runMMMC(corners, paths);
    expect(r.worstWNS.pathId).toBe('longest');
    expect(r.worstWNS.cornerId).toBe('ss_0p81_125'); // slowest corner
  });

  it('clockUncertainty tightens slack by exactly its value', () => {
    const base: Corner = {
      id: 'c', mode: 'functional', process: 'tt', voltage: 0.9, temperature: 25,
      rcCorner: 'rc-typ', cellDerate: 1.0, wireDerate: 1.0, clockUncertainty: 0,
    };
    const tight: Corner = { ...base, id: 'c2', clockUncertainty: 75 };
    const p = simplePath('p', 100, 30, 3);
    const r = runMMMC([base, tight], [p]);
    const r0 = r.perPath.find(x => x.cornerId === 'c')!;
    const r1 = r.perPath.find(x => x.cornerId === 'c2')!;
    expect(r0.slack - r1.slack).toBeCloseTo(75);
  });

  it('handles empty paths array gracefully', () => {
    const r = runMMMC(defaultCorners(), []);
    expect(r.perPath).toEqual([]);
    expect(r.totalTNS).toBe(0);
  });
});
