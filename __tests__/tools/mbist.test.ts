import { planMbist } from '@/lib/tools/mbist';

describe('planMbist', () => {
  it('computes 10N MARCH cycles', () => {
    const r = planMbist({
      macros: [{ name: 'M0', depth: 1024, width: 32 }],
      clockNs: 1,
    });
    expect(r.macros[0].cycles).toBe(10240);
    expect(r.macros[0].testTimeUs).toBeCloseTo(10.24, 3);
    expect(r.totalCycles).toBe(10240);
  });

  it('aggregates wrapper area across macros', () => {
    const r = planMbist({
      macros: [
        { name: 'A', depth: 256, width: 8 },
        { name: 'B', depth: 512, width: 16 },
      ],
      clockNs: 2,
      wrapperGates: 100,
    });
    expect(r.totalWrapperAreaUm2).toBeCloseTo(200, 6);
    expect(r.totalCycles).toBe(2560 + 5120);
  });

  it('throws on bad clock', () => {
    expect(() => planMbist({ macros: [], clockNs: 0 })).toThrow();
  });
});
