import { sizeGmId } from '@/lib/tools/gm_id';
describe('sizeGmId', () => {
  it('weak inversion gives high gm/Id', () => {
    const r = sizeGmId({ gmTarget: 1e-3, region: 'weak', uCox: 250e-6, L: 60e-9 });
    expect(r.gmIdRatio).toBeGreaterThan(20);
    expect(r.Id).toBeLessThan(1e-3 / 20 + 1e-9);
  });
  it('strong inversion gives lower gm/Id and more current', () => {
    const w = sizeGmId({ gmTarget: 1e-3, region: 'weak', uCox: 250e-6, L: 60e-9 });
    const s = sizeGmId({ gmTarget: 1e-3, region: 'strong', uCox: 250e-6, L: 60e-9 });
    expect(s.Id).toBeGreaterThan(w.Id);
    expect(s.gmIdRatio).toBeLessThan(w.gmIdRatio);
  });
  it('throws on bad input', () => {
    expect(() => sizeGmId({ gmTarget: -1, region: 'moderate', uCox: 250e-6, L: 60e-9 }))
      .toThrow();
  });
});
