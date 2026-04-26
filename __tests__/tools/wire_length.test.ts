import { computeWireLength } from '@/lib/tools/wire_length';

describe('computeWireLength', () => {
  it('computes HPWL = bboxW + bboxH for a 2-pin net', () => {
    const r = computeWireLength([{
      name: 'n1', terminals: [{ x: 0, y: 0 }, { x: 10, y: 5 }],
    }]);
    expect(r.totalHpwl).toBe(15);
    expect(r.perNet[0].hpwl).toBe(15);
    expect(r.perNet[0].bboxW).toBe(10);
    expect(r.perNet[0].bboxH).toBe(5);
  });

  it('treats single-terminal nets as zero-length and warns', () => {
    const r = computeWireLength([
      { name: 'dangling', terminals: [{ x: 1, y: 1 }] },
      { name: 'empty', terminals: [] },
    ]);
    expect(r.totalHpwl).toBe(0);
    expect(r.warnings.length).toBe(2);
    expect(r.perNet.every(n => n.hpwl === 0)).toBe(true);
  });

  it('aggregates per-layer using layerHint', () => {
    const r = computeWireLength([
      { name: 'a', terminals: [{ x: 0, y: 0 }, { x: 10, y: 0 }], layerHint: 'M2' },
      { name: 'b', terminals: [{ x: 0, y: 0 }, { x:  5, y: 0 }], layerHint: 'M2' },
      { name: 'c', terminals: [{ x: 0, y: 0 }, { x: 20, y: 0 }], layerHint: 'M3' },
    ]);
    expect(r.perLayer.length).toBe(2);
    const m2 = r.perLayer.find(l => l.layer === 'M2')!;
    const m3 = r.perLayer.find(l => l.layer === 'M3')!;
    expect(m2.nets).toBe(2);
    expect(m2.totalHpwl).toBe(15);
    expect(m3.totalHpwl).toBe(20);
    // Sorted by totalHpwl desc → M3 first.
    expect(r.perLayer[0].layer).toBe('M3');
  });

  it('tracks maxNetHpwl and avgFanout', () => {
    const r = computeWireLength([
      { name: 'a', terminals: [{ x: 0, y: 0 }, { x: 10, y: 0 }] },
      { name: 'b', terminals: [{ x: 0, y: 0 }, { x: 0, y: 100 }] },
      { name: 'c', terminals: [
        { x: 0, y: 0 }, { x: 5, y: 5 }, { x: 10, y: 10 },
      ] },
    ]);
    expect(r.maxNetHpwl).toBe(100);
    expect(r.avgFanout).toBeCloseTo((2 + 2 + 3) / 3, 6);
  });

  it('handles a degenerate net where all terminals coincide', () => {
    const r = computeWireLength([{
      name: 'shorted',
      terminals: [{ x: 5, y: 5 }, { x: 5, y: 5 }, { x: 5, y: 5 }],
    }]);
    expect(r.perNet[0].hpwl).toBe(0);
    expect(r.totalHpwl).toBe(0);
    expect(r.warnings.length).toBe(0);
  });
});
