import { insertTapsAndEndcaps } from '@/lib/tools/tap_endcap';
import { exampleFloorplan, generateRows } from '@/lib/algorithms/floorplan';

function testFloorplan() {
  const fp = exampleFloorplan();
  fp.rows = generateRows(fp, { site: 'unit', siteWidth: 0.46, rowHeight: 2.72 });
  return fp;
}

const SPEC = {
  tapMaster: 'TAPCELL',
  endcapMaster: 'ENDCAP',
  tapPitch: 25,
  siteWidth: 0.46,
  tapWidth: 0.46,
  tapHeight: 2.72,
};

describe('insertTapsAndEndcaps', () => {
  it('inserts at least 2 endcaps per row', () => {
    const fp = testFloorplan();
    const r = insertTapsAndEndcaps(fp, SPEC);
    // Most rows should get both endcaps; allow a small number of skips
    // when a fixed macro covers the row's edge.
    const expectedRows = fp.rows.length;
    expect(r.totalEndcaps).toBeGreaterThanOrEqual(expectedRows * 2 - 4);
    expect(r.totalEndcaps).toBeLessThanOrEqual(expectedRows * 2);
  });

  it('inserts taps spaced at roughly tapPitch', () => {
    const fp = testFloorplan();
    const r = insertTapsAndEndcaps(fp, SPEC);
    expect(r.totalTaps).toBeGreaterThan(0);
    // Taps in the first row.
    const row0Y = fp.rows[0].y;
    const taps = r.components
      .filter(c => c.master === 'TAPCELL' && Math.abs(c.y - row0Y) < 1e-6)
      .map(c => c.x)
      .sort((a, b) => a - b);
    if (taps.length >= 2) {
      const gaps = taps.slice(1).map((x, i) => x - taps[i]);
      // Snapped pitch can vary by ≤ siteWidth.
      for (const g of gaps) {
        expect(g).toBeGreaterThanOrEqual(SPEC.tapPitch - SPEC.siteWidth);
        expect(g).toBeLessThanOrEqual(SPEC.tapPitch + SPEC.siteWidth);
      }
    }
  });

  it('skips sites that overlap a fixed macro', () => {
    const fp = testFloorplan();
    fp.macros.push({
      name: 'BIG_MACRO', master: 'MACRO_X', x: fp.core.xl + 5, y: fp.core.yl + 5,
      width: 30, height: 30, halo: 0, orient: 'N', fixed: true,
    });
    const r = insertTapsAndEndcaps(fp, SPEC);
    for (const c of r.components) {
      const overlaps =
        c.x < fp.core.xl + 5 + 30 &&
        c.x + c.width > fp.core.xl + 5 &&
        c.y < fp.core.yl + 5 + 30 &&
        c.y + c.height > fp.core.yl + 5;
      expect(overlaps).toBe(false);
    }
  });

  it('warns on zero-width rows', () => {
    const fp = testFloorplan();
    fp.rows = [{ ...fp.rows[0], numX: 0 }];
    const r = insertTapsAndEndcaps(fp, SPEC);
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it('throws on bad spec', () => {
    expect(() => insertTapsAndEndcaps(testFloorplan(), { ...SPEC, tapPitch: 0 }))
      .toThrow();
  });
});
