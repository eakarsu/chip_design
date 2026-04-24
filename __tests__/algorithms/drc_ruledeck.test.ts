import {
  runDrc, parseRuleDeck, RuleDeck, Geometry,
} from '@/lib/algorithms/drc_ruledeck';

const g = (id: string, layer: string, xl: number, yl: number, xh: number, yh: number): Geometry => ({
  id, layer, rect: { xl, yl, xh, yh },
});

describe('DRC — min_width', () => {
  it('flags a shape narrower than the rule', () => {
    const deck: RuleDeck = {
      name: 't', technology: 'tt',
      rules: [{ kind: 'min_width', layer: 'metal1', min: 0.05 }],
    };
    const geoms = [
      g('w1', 'metal1', 0, 0, 0.01, 1),  // 0.01 µm wide
      g('w2', 'metal1', 0, 2, 0.1,  3),  // fine
    ];
    const r = runDrc(deck, geoms);
    expect(r.violations).toHaveLength(1);
    expect(r.violations[0].geometries).toEqual(['w1']);
  });
});

describe('DRC — min_spacing', () => {
  it('flags two wires closer than the rule', () => {
    const deck: RuleDeck = {
      name: 't', technology: 'tt',
      rules: [{ kind: 'min_spacing', layer: 'metal1', min: 0.1 }],
    };
    const geoms = [
      g('a', 'metal1', 0, 0, 1, 0.1),
      g('b', 'metal1', 0, 0.15, 1, 0.25), // gap 0.05 (horiz)
    ];
    const r = runDrc(deck, geoms);
    expect(r.violations).toHaveLength(1);
    expect(r.violations[0].geometries.sort()).toEqual(['a', 'b']);
  });

  it('does not flag spacing that equals or exceeds the threshold', () => {
    const deck: RuleDeck = {
      name: 't', technology: 'tt',
      rules: [{ kind: 'min_spacing', layer: 'metal1', min: 0.1 }],
    };
    const geoms = [
      g('a', 'metal1', 0, 0, 1, 0.1),
      g('b', 'metal1', 0, 0.5, 1, 0.6),
    ];
    expect(runDrc(deck, geoms).violations).toHaveLength(0);
  });
});

describe('DRC — min_area', () => {
  it('flags shapes below the minimum area', () => {
    const deck: RuleDeck = {
      name: 't', technology: 'tt',
      rules: [{ kind: 'min_area', layer: 'metal2', min: 0.01 }],
    };
    const geoms = [
      g('tiny', 'metal2', 0, 0, 0.02, 0.02),  // area 0.0004
      g('ok',   'metal2', 0, 0, 0.5, 0.5),
    ];
    const r = runDrc(deck, geoms);
    expect(r.violations.map(v => v.geometries).flat()).toEqual(['tiny']);
  });
});

describe('DRC — enclosure', () => {
  it('requires outer layer to extend past inner on every side', () => {
    const deck: RuleDeck = {
      name: 't', technology: 'tt',
      rules: [{ kind: 'enclosure', inner: 'via1', outer: 'metal1', min: 0.02 }],
    };
    const geoms = [
      g('via', 'via1',    1, 1, 1.05, 1.05),
      g('m1ok',  'metal1',  0.95, 0.95, 1.10, 1.10),  // margin ≥ 0.025
      g('via2', 'via1', 5, 5, 5.05, 5.05),
      g('m1bad', 'metal1',  4.99, 4.99, 5.06, 5.06), // margin 0.01 < 0.02
    ];
    const r = runDrc(deck, geoms);
    const vids = r.violations.flatMap(v => v.geometries);
    expect(vids).toContain('via2');
    expect(vids).not.toContain('via');
  });
});

describe('DRC — density', () => {
  it('flags sub-threshold coverage windows', () => {
    const deck: RuleDeck = {
      name: 't', technology: 'tt',
      rules: [{ kind: 'density', layer: 'metal1', window: 10, min: 0.2, max: 0.8 }],
    };
    const geoms = [
      // One tiny shape inside a 10×10 window → density ~0.0001 < 0.2
      g('a', 'metal1', 0.5, 0.5, 0.6, 0.6),
    ];
    const r = runDrc(deck, geoms);
    expect(r.violations.some(v => v.kind === 'density')).toBe(true);
  });

  it('does not flag when density is inside the allowed band', () => {
    const deck: RuleDeck = {
      name: 't', technology: 'tt',
      rules: [{ kind: 'density', layer: 'metal1', window: 10, min: 0.2, max: 0.8 }],
    };
    const geoms = [
      g('cov', 'metal1', 0, 0, 5, 10), // 50 / 100 = 50%
    ];
    const r = runDrc(deck, geoms);
    expect(r.violations.filter(v => v.kind === 'density')).toEqual([]);
  });
});

describe('DRC — extension', () => {
  it('flags wires that do not extend past a via by the minimum', () => {
    const deck: RuleDeck = {
      name: 't', technology: 'tt',
      rules: [{ kind: 'extension', layer: 'metal1', over: 'via1', min: 0.03 }],
    };
    const geoms = [
      g('wire1', 'metal1', 0, 0, 0.05, 0.05),
      g('via1',  'via1',   0, 0, 0.04, 0.04),  // wire extends only 0.01
    ];
    const r = runDrc(deck, geoms);
    expect(r.violations.some(v => v.kind === 'extension')).toBe(true);
  });
});

describe('DRC — deck loading', () => {
  it('parses a valid deck JSON', () => {
    const raw = JSON.stringify({
      name: 'toy', technology: 'demo',
      rules: [{ kind: 'min_width', layer: 'm1', min: 0.05 }],
    });
    const d = parseRuleDeck(raw);
    expect(d.rules).toHaveLength(1);
  });

  it('rejects malformed decks', () => {
    expect(() => parseRuleDeck('{}')).toThrow();
    expect(() => parseRuleDeck({ name: 'x', technology: 'y' } as any)).toThrow(/rules/);
  });
});
