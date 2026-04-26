import {
  extractXSection, defaultStackup, type LayerRect,
} from '@/lib/tools/xsection';

const STACK = defaultStackup();

describe('extractXSection', () => {
  it('emits a slab for every rect intersected by an x-cut', () => {
    const rects: LayerRect[] = [
      { layer: 'M1', x: 0, y: 0, width: 10, height: 1 },
      { layer: 'M2', x: 0, y: 0, width: 5,  height: 2 },
      { layer: 'M1', x: 0, y: 5, width: 10, height: 1 }, // out of cut
    ];
    const r = extractXSection({ stack: STACK, rects, axis: 'x', at: 0.5 });
    expect(r.slabs.length).toBe(2);
    expect(r.slabs.every(s => s.s1 === 0)).toBe(true);
    expect(r.layersHit).toEqual(['M1', 'M2']);
  });

  it('uses z + thickness from the stack-up', () => {
    const m1 = STACK.find(l => l.name === 'M1')!;
    const r = extractXSection({
      stack: STACK,
      rects: [{ layer: 'M1', x: 0, y: 0, width: 1, height: 1 }],
      axis: 'x', at: 0.5,
    });
    expect(r.slabs[0].z1).toBe(m1.z);
    expect(r.slabs[0].z2).toBe(m1.z + m1.thickness);
  });

  it('projects onto x for axis="x" and onto y for axis="y"', () => {
    const rect: LayerRect = { layer: 'M1', x: 2, y: 3, width: 10, height: 4 };
    const xCut = extractXSection({
      stack: STACK, rects: [rect], axis: 'x', at: 5,
    });
    const yCut = extractXSection({
      stack: STACK, rects: [rect], axis: 'y', at: 5,
    });
    expect(xCut.slabs[0].s1).toBe(2);
    expect(xCut.slabs[0].s2).toBe(12);
    expect(yCut.slabs[0].s1).toBe(3);
    expect(yCut.slabs[0].s2).toBe(7);
  });

  it('warns on rects with unknown layers', () => {
    const r = extractXSection({
      stack: STACK,
      rects: [{ layer: 'M99', x: 0, y: 0, width: 1, height: 1 }],
      axis: 'x', at: 0.5,
    });
    expect(r.slabs.length).toBe(0);
    expect(r.warnings.length).toBe(1);
  });

  it('clips to the section window', () => {
    const r = extractXSection({
      stack: STACK,
      rects: [{ layer: 'M1', x: -5, y: 0, width: 20, height: 1 }],
      axis: 'x', at: 0.5,
      windowMin: 0, windowMax: 10,
    });
    expect(r.slabs[0].s1).toBe(0);
    expect(r.slabs[0].s2).toBe(10);
  });

  it('orders layersHit by z', () => {
    const r = extractXSection({
      stack: STACK,
      rects: [
        { layer: 'M3', x: 0, y: 0, width: 1, height: 1 },
        { layer: 'M1', x: 0, y: 0, width: 1, height: 1 },
        { layer: 'M2', x: 0, y: 0, width: 1, height: 1 },
      ],
      axis: 'x', at: 0.5,
    });
    expect(r.layersHit).toEqual(['M1', 'M2', 'M3']);
  });

  it('throws on bad input', () => {
    expect(() => extractXSection({
      stack: [], rects: [], axis: 'x', at: 0,
    })).toThrow();
  });
});
