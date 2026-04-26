import { estimateTcam } from '@/lib/tools/tcam';

describe('estimateTcam', () => {
  it('scales area with entries × width', () => {
    const a = estimateTcam({
      entries: 1024, widthBits: 32, cellType: 'NOR_16T', techNm: 16,
    });
    const b = estimateTcam({
      entries: 2048, widthBits: 32, cellType: 'NOR_16T', techNm: 16,
    });
    expect(b.areaUm2 / a.areaUm2).toBeCloseTo(2, 2);
  });

  it('NAND uses fewer transistors and less search energy', () => {
    const nor = estimateTcam({
      entries: 256, widthBits: 64, cellType: 'NOR_16T', techNm: 16,
    });
    const nand = estimateTcam({
      entries: 256, widthBits: 64, cellType: 'NAND_14T', techNm: 16,
    });
    expect(nand.areaUm2).toBeLessThan(nor.areaUm2);
    expect(nand.searchEnergyPj).toBeLessThan(nor.searchEnergyPj);
  });

  it('returns lookup-rate budget when power-capped', () => {
    const r = estimateTcam(
      { entries: 1024, widthBits: 32, cellType: 'NOR_16T', techNm: 16 },
      { maxPowerMw: 10 },
    );
    expect(r.maxLookupsPerSec).toBeGreaterThan(0);
  });

  it('throws on zero entries', () => {
    expect(() => estimateTcam({
      entries: 0, widthBits: 32, cellType: 'NOR_16T', techNm: 16,
    })).toThrow();
  });
});
