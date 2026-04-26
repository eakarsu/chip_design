import { insertFill, computeDensityGrid } from '@/lib/tools/density_fill';

describe('computeDensityGrid', () => {
  it('returns the right grid size and value for a single rect', () => {
    const g = computeDensityGrid(
      { x1: 0, y1: 0, x2: 10, y2: 10 },
      [{ x1: 0, y1: 0, x2: 5, y2: 5 }],
      2, 2,
    );
    expect(g.density).toHaveLength(2);
    expect(g.density[0][0]).toBeCloseTo(1.0, 6);
    expect(g.density[1][1]).toBeCloseTo(0, 6);
  });
});

describe('insertFill', () => {
  it('inserts fills into an empty window up to the target', () => {
    const r = insertFill({
      window: { x1: 0, y1: 0, x2: 20, y2: 20 },
      obstacles: [],
      targetDensity: 0.3,
      cellW: 1, cellH: 1,
      pitch: 2,
      minSpacing: 0.2,
      bins: 4,
    });
    expect(r.fills.length).toBeGreaterThan(0);
    expect(r.meanAfter).toBeGreaterThan(0);
  });

  it('respects min spacing against obstacles', () => {
    const obstacle = { x1: 4, y1: 4, x2: 6, y2: 6 };
    const r = insertFill({
      window: { x1: 0, y1: 0, x2: 10, y2: 10 },
      obstacles: [obstacle],
      targetDensity: 1.0, // demand max fill
      cellW: 1, cellH: 1,
      pitch: 1.4,
      minSpacing: 0.4,
      bins: 4,
    });
    for (const f of r.fills) {
      const dx = Math.max(obstacle.x1 - f.x2, f.x1 - obstacle.x2, 0);
      const dy = Math.max(obstacle.y1 - f.y2, f.y1 - obstacle.y2, 0);
      // either separated horizontally or vertically by ≥ minSpacing
      const sep = Math.max(dx, dy);
      expect(sep + 1e-9).toBeGreaterThanOrEqual(0.4);
    }
  });

  it('does not over-fill bins already above target', () => {
    const obstacles = [{ x1: 0, y1: 0, x2: 5, y2: 5 }]; // bin (0,0) is 100%
    const r = insertFill({
      window: { x1: 0, y1: 0, x2: 10, y2: 10 },
      obstacles,
      targetDensity: 0.5,
      cellW: 1, cellH: 1,
      pitch: 1.5,
      minSpacing: 0.2,
      bins: 2,
    });
    // No fill should land inside bin (0,0).
    for (const f of r.fills) {
      const cx = (f.x1 + f.x2) / 2;
      const cy = (f.y1 + f.y2) / 2;
      const inBin00 = cx < 5 && cy < 5;
      expect(inBin00).toBe(false);
    }
  });

  it('reports underfilled bins when target is unreachable', () => {
    const r = insertFill({
      window: { x1: 0, y1: 0, x2: 10, y2: 10 },
      obstacles: [],
      targetDensity: 0.99,
      cellW: 0.5, cellH: 0.5,
      pitch: 5, // pitch >> cell, so density caps low
      minSpacing: 0.2,
      bins: 2,
    });
    expect(r.underfilled.length).toBeGreaterThan(0);
  });

  it('throws on degenerate window', () => {
    expect(() => insertFill({
      window: { x1: 0, y1: 0, x2: 0, y2: 10 },
      obstacles: [],
    })).toThrow();
  });
});
