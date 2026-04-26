import { genCommonCentroid } from '@/lib/tools/common_centroid';
describe('genCommonCentroid', () => {
  it('placement has no centroid drift for symmetric ABBA', () => {
    const r = genCommonCentroid({ groups: 2, unitsPerGroup: 8 });
    expect(r.maxOffset).toBeLessThan(0.01);
  });
  it('produces an even-sided array', () => {
    const r = genCommonCentroid({ groups: 4, unitsPerGroup: 4 });
    expect(r.rows % 2).toBe(0);
    expect(r.cols).toBe(r.rows);
  });
  it('throws on too-few groups', () => {
    expect(() => genCommonCentroid({ groups: 1, unitsPerGroup: 4 })).toThrow();
  });
});
