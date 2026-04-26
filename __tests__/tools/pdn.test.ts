import { generatePdn, emitDef, exampleSpec } from '@/lib/tools/pdn';

describe('generatePdn', () => {
  it('emits 8 ring segments (2 nets × 4 sides)', () => {
    const r = generatePdn(exampleSpec());
    expect(r.rings).toHaveLength(8);
    expect(r.metrics.rings).toBe(8);
  });

  it('places stripes at the requested pitch', () => {
    const spec = exampleSpec();
    const r = generatePdn(spec);
    // Span 200μm with pitch 30μm starting at sp/2=15 → expect ~6 stripes.
    expect(r.stripes.length).toBeGreaterThanOrEqual(5);
    expect(r.stripes.length).toBeLessThanOrEqual(7);
    // Alternates VDD/VSS.
    expect(r.stripes[0].net).toBe('VDD');
    expect(r.stripes[1].net).toBe('VSS');
  });

  it('omits straps when strapLayer is missing', () => {
    const r = generatePdn({ ...exampleSpec(), strapLayer: undefined });
    expect(r.straps).toHaveLength(0);
  });

  it('throws on degenerate core', () => {
    expect(() => generatePdn({ ...exampleSpec(), core: { x1: 0, y1: 0, x2: 0, y2: 100 } }))
      .toThrow();
  });

  it('coverage is in (0,1)', () => {
    const r = generatePdn(exampleSpec());
    expect(r.metrics.coverage).toBeGreaterThan(0);
    expect(r.metrics.coverage).toBeLessThan(1);
  });
});

describe('emitDef', () => {
  it('produces a SPECIALNETS block with both nets', () => {
    const spec = exampleSpec();
    const r = generatePdn(spec);
    const def = emitDef(r, spec);
    expect(def).toMatch(/^SPECIALNETS\s+2\s+;/m);
    expect(def).toMatch(/- VDD/);
    expect(def).toMatch(/- VSS/);
    expect(def).toMatch(/END SPECIALNETS/);
    expect(def).toMatch(/RECT/);
  });

  it('scales coordinates by dbuPerMicron', () => {
    const spec = { ...exampleSpec(), dbuPerMicron: 2000 };
    const r = generatePdn(spec);
    const def = emitDef(r, spec);
    // Core extends to 200μm × 2000 = 400000 DBU; numbers like 400000 should appear.
    expect(def).toMatch(/\b\d{5,}\b/);
  });
});
