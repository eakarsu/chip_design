import { checkPinAccess } from '@/lib/tools/pin_access';

describe('checkPinAccess', () => {
  it('counts horizontal tracks crossing a pin', () => {
    const r = checkPinAccess({
      pins: [{ name: 'U1/A', layer: 'M2', x: 0, y: 0, width: 1, height: 1 }],
      // Tracks at y = 0, 0.2, 0.4, 0.6, 0.8, 1.0 → 6 tracks in [0, 1].
      tracks: [{ layer: 'M2', direction: 'h', offset: 0, step: 0.2 }],
    });
    expect(r.reports[0].hAccess).toBe(6);
    expect(r.reports[0].vAccess).toBe(0);
    expect(r.reports[0].total).toBe(6);
    expect(r.reports[0].ok).toBe(true);
  });

  it('counts vertical tracks crossing a pin', () => {
    const r = checkPinAccess({
      pins: [{ name: 'U1/A', layer: 'M3', x: 1, y: 0, width: 2, height: 5 }],
      // Tracks at x = 0, 0.5, 1.0, ... — in [1, 3] → 1.0, 1.5, 2.0, 2.5, 3.0 → 5.
      tracks: [{ layer: 'M3', direction: 'v', offset: 0, step: 0.5 }],
    });
    expect(r.reports[0].vAccess).toBe(5);
  });

  it('ignores tracks on other layers', () => {
    const r = checkPinAccess({
      pins: [{ name: 'A', layer: 'M2', x: 0, y: 0, width: 1, height: 1 }],
      tracks: [{ layer: 'M3', direction: 'h', offset: 0, step: 0.2 }],
    });
    expect(r.reports[0].total).toBe(0);
    expect(r.reports[0].ok).toBe(false);
    expect(r.failing.length).toBe(1);
  });

  it('flags pins below minAccess', () => {
    const r = checkPinAccess({
      pins: [
        { name: 'big',   layer: 'M2', x: 0, y: 0, width: 1, height: 1 },
        { name: 'small', layer: 'M2', x: 0, y: 0, width: 0.05, height: 0.05 },
      ],
      tracks: [{ layer: 'M2', direction: 'h', offset: 0, step: 0.2 }],
      minAccess: 3,
    });
    expect(r.reports[0].ok).toBe(true);
    expect(r.reports[1].ok).toBe(false);
    expect(r.totalFailing).toBe(1);
  });

  it('builds an access-count histogram', () => {
    const r = checkPinAccess({
      pins: [
        { name: 'a', layer: 'M2', x: 0, y: 0, width: 0.05, height: 0.05 }, // 1 hit
        { name: 'b', layer: 'M2', x: 0, y: 0, width: 0.05, height: 0.05 }, // 1 hit
        { name: 'c', layer: 'M2', x: 0, y: 0, width: 0.5,  height: 0.05 }, // 1 hit
      ],
      tracks: [{ layer: 'M2', direction: 'h', offset: 0, step: 1 }],
    });
    expect(r.histogram[1]).toBe(3);
  });

  it('throws on bad track step', () => {
    expect(() => checkPinAccess({
      pins: [],
      tracks: [{ layer: 'M2', direction: 'h', offset: 0, step: 0 }],
    })).toThrow();
  });

  it('warns on zero-size pins', () => {
    const r = checkPinAccess({
      pins: [{ name: 'bad', layer: 'M2', x: 0, y: 0, width: 0, height: 0 }],
      tracks: [{ layer: 'M2', direction: 'h', offset: 0, step: 0.2 }],
    });
    expect(r.warnings.length).toBe(1);
    expect(r.reports[0].ok).toBe(false);
  });
});
