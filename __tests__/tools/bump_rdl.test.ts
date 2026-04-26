import { planBumps } from '@/lib/tools/bump_rdl';

const DIE = { xl: 0, yl: 0, xh: 1000, yh: 1000 };

describe('planBumps', () => {
  it('places a regular grid array on a square die', () => {
    const r = planBumps({
      die: DIE, pitch: 200, diameter: 100, edgeKeepout: 100,
      pattern: 'grid', pads: [],
    });
    // x ∈ {100,300,500,700,900} (5), same for y → 25 bumps.
    expect(r.bumpCount).toBe(25);
    expect(r.bumps[0]).toMatchObject({ x: 100, y: 100 });
  });

  it('places a hex array with row offset = pitch/2', () => {
    const r = planBumps({
      die: DIE, pitch: 200, diameter: 100, edgeKeepout: 100,
      pattern: 'hex', pads: [],
    });
    // First row: x = 100, 300, 500, 700, 900 (offset 0)
    // Second row: x = 200, 400, 600, 800 (offset 100), y ≈ 100 + 173.2.
    const row0 = r.bumps.filter(b => Math.abs(b.y - 100) < 1e-6).map(b => b.x);
    const row1 = r.bumps.filter(b => Math.abs(b.y - (100 + 200 * Math.sqrt(3) / 2)) < 1e-6).map(b => b.x);
    expect(row0).toEqual([100, 300, 500, 700, 900]);
    expect(row1.length).toBeGreaterThan(0);
    expect(row1[0]).toBe(200);
  });

  it('assigns each pad to the nearest free bump', () => {
    const r = planBumps({
      die: DIE, pitch: 200, diameter: 100, edgeKeepout: 100, pattern: 'grid',
      pads: [
        { name: 'pad_close',  x: 110, y: 110 },
        { name: 'pad_corner', x: 880, y: 880 },
      ],
    });
    expect(r.assigned).toBe(2);
    const close = r.traces.find(t => t.pad === 'pad_close')!;
    expect(close.length).toBeLessThan(50); // very close to (100,100)
  });

  it('reports unassigned pads when bumps run out', () => {
    const r = planBumps({
      die: { xl: 0, yl: 0, xh: 200, yh: 200 },
      pitch: 100, diameter: 50, edgeKeepout: 100,
      pattern: 'grid',
      pads: [
        { name: 'a', x: 0, y: 0 },
        { name: 'b', x: 0, y: 0 },
      ],
    });
    expect(r.bumpCount).toBe(1); // only (100,100)
    expect(r.assigned).toBe(1);
    expect(r.unassigned).toEqual(['b']);
  });

  it('emits L-shaped 3-point polylines and Manhattan length', () => {
    const r = planBumps({
      die: DIE, pitch: 200, diameter: 100, edgeKeepout: 100, pattern: 'grid',
      pads: [{ name: 'p', x: 50, y: 80 }],
    });
    const t = r.traces[0];
    expect(t.points.length).toBe(3);
    // pad → (bumpX, padY) → (bumpX, bumpY)
    const [p0, p1, p2] = t.points;
    expect(p0).toEqual({ x: 50, y: 80 });
    expect(p1.y).toBe(p0.y);
    expect(p2.x).toBe(p1.x);
    expect(t.length).toBeCloseTo(Math.abs(p1.x - p0.x) + Math.abs(p2.y - p1.y), 6);
  });

  it('throws on bad spec', () => {
    expect(() => planBumps({
      die: DIE, pitch: 0, diameter: 50, edgeKeepout: 0,
      pattern: 'grid', pads: [],
    })).toThrow();
    expect(() => planBumps({
      die: DIE, pitch: 100, diameter: 100, edgeKeepout: 0,
      pattern: 'grid', pads: [],
    })).toThrow();
  });

  it('warns when keepout swallows the die', () => {
    const r = planBumps({
      die: { xl: 0, yl: 0, xh: 100, yh: 100 },
      pitch: 50, diameter: 25, edgeKeepout: 60,
      pattern: 'grid', pads: [{ name: 'p', x: 0, y: 0 }],
    });
    expect(r.bumpCount).toBe(0);
    expect(r.warnings.length).toBeGreaterThan(0);
    expect(r.unassigned).toEqual(['p']);
  });
});
