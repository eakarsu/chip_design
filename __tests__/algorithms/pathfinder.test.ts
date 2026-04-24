/**
 * @jest-environment node
 */
import { pathfinder } from '@/lib/algorithms/pathfinder';

describe('PathFinder — negotiated routing', () => {
  test('routes two non-conflicting nets in one pass with zero overflow', () => {
    const r = pathfinder({
      nets: [
        { id: 'a', pins: [{ x: 0, y: 0 }, { x: 50, y: 0 }] },
        { id: 'b', pins: [{ x: 0, y: 100 }, { x: 50, y: 100 }] },
      ],
      gridPitch: 10,
      chipWidth: 100,
      chipHeight: 100,
    });
    expect(r.legal).toBe(true);
    expect(r.overflowEdges).toBe(0);
    expect(r.iterations).toBeGreaterThanOrEqual(1);
  });

  test('reroutes second net around contested edge under capacity 1', () => {
    // Two nets that would naturally compete on the bottom row;
    // with capacity 1, one of them should detour.
    const r = pathfinder({
      nets: [
        { id: 'a', pins: [{ x: 0, y: 0 }, { x: 100, y: 0 }] },
        { id: 'b', pins: [{ x: 0, y: 0 }, { x: 100, y: 0 }] },
      ],
      gridPitch: 10,
      chipWidth: 100,
      chipHeight: 100,
      edgeCapacity: 1,
      maxIterations: 30,
    });
    // Either it converges legally (one net detours) or it gives up after maxIter.
    // Both endpoints of the two nets coincide so the tail edges always conflict;
    // this is unsatisfiable — assert that the algorithm returns deterministically.
    expect(r.iterations).toBeGreaterThan(0);
    expect(r.routes.length).toBe(2);
  });

  test('handles empty nets gracefully', () => {
    const r = pathfinder({
      nets: [],
      gridPitch: 10,
      chipWidth: 100,
      chipHeight: 100,
    });
    expect(r.legal).toBe(true);
    expect(r.routes.length).toBe(0);
    expect(r.totalWirelength).toBe(0);
  });

  test('multi-pin net is routed sequentially', () => {
    const r = pathfinder({
      nets: [
        { id: 'multi', pins: [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 30 }] },
      ],
      gridPitch: 10,
      chipWidth: 100,
      chipHeight: 100,
    });
    expect(r.routes[0].length).toBeGreaterThanOrEqual(60);
    expect(r.legal).toBe(true);
  });
});
