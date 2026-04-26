import {
  computeDiesPerWafer, packReticle,
} from '@/lib/tools/wafer';

describe('computeDiesPerWafer', () => {
  it('counts dies on a 300mm wafer for a 10x10mm die', () => {
    const r = computeDiesPerWafer({
      waferDiameter: 300, edgeExclusion: 3,
      dieWidth: 10, dieHeight: 10, scribeWidth: 0.1,
    });
    // The accepted approximation gives ~640 dies for 10x10 / 300mm @ 3mm EE.
    expect(r.grossDies).toBeGreaterThan(550);
    expect(r.grossDies).toBeLessThan(700);
    expect(r.utilisation).toBeGreaterThan(0.8);
  });

  it('respects edgeExclusion strictly', () => {
    const small = computeDiesPerWafer({
      waferDiameter: 300, edgeExclusion: 0,
      dieWidth: 10, dieHeight: 10, scribeWidth: 0,
    });
    const big = computeDiesPerWafer({
      waferDiameter: 300, edgeExclusion: 30,
      dieWidth: 10, dieHeight: 10, scribeWidth: 0,
    });
    expect(big.grossDies).toBeLessThan(small.grossDies);
    expect(big.printableArea).toBeLessThan(small.printableArea);
  });

  it('applies Murphy yield when defectDensity is given', () => {
    const r = computeDiesPerWafer({
      waferDiameter: 300, edgeExclusion: 3,
      dieWidth: 10, dieHeight: 10, scribeWidth: 0.1,
      defectDensity: 0.2, // defects/cm²
    });
    expect(r.yieldPerDie).toBeGreaterThan(0);
    expect(r.yieldPerDie).toBeLessThan(1);
    expect(r.goodDies).toBeCloseTo(r.grossDies * (r.yieldPerDie ?? 0), 6);
  });

  it('returns 0 dies when exclusion swallows the wafer', () => {
    const r = computeDiesPerWafer({
      waferDiameter: 100, edgeExclusion: 60,
      dieWidth: 5, dieHeight: 5, scribeWidth: 0,
    });
    expect(r.grossDies).toBe(0);
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it('throws on bad spec', () => {
    expect(() => computeDiesPerWafer({
      waferDiameter: 0, edgeExclusion: 0,
      dieWidth: 1, dieHeight: 1, scribeWidth: 0,
    })).toThrow();
  });
});

describe('packReticle', () => {
  it('packs shelves left-to-right by decreasing height', () => {
    const r = packReticle({
      reticleWidth: 26, reticleHeight: 33, gap: 0.1,
      dies: [
        { name: 'tall',  width: 10, height: 20 },
        { name: 'short', width: 10, height: 5  },
        { name: 'med',   width: 10, height: 10 },
      ],
    });
    expect(r.placements.length).toBe(3);
    // First shelf has tall + med (or tall + short).
    const tall = r.placements.find(p => p.name === 'tall')!;
    expect(tall.x).toBe(0);
    expect(tall.y).toBe(0);
  });

  it('marks oversized dies as unplaced', () => {
    const r = packReticle({
      reticleWidth: 10, reticleHeight: 10, gap: 0,
      dies: [{ name: 'huge', width: 50, height: 50 }],
    });
    expect(r.placements.length).toBe(0);
    expect(r.unplaced).toEqual(['huge']);
  });

  it('reports utilisation', () => {
    const r = packReticle({
      reticleWidth: 10, reticleHeight: 10, gap: 0,
      dies: [{ name: 'a', width: 5, height: 5 }],
    });
    expect(r.utilisation).toBeCloseTo(25 / 100, 6);
  });

  it('throws on bad reticle size', () => {
    expect(() => packReticle({
      reticleWidth: 0, reticleHeight: 10, gap: 0, dies: [],
    })).toThrow();
  });
});
