/** @jest-environment node */
import { memoryTechInputSchema, projectMemoryTechnology } from '@/lib/ai-systems/memoryTech';

describe('ai-systems/memoryTech embedded-DRAM projection', () => {
  it('spot-checks density, capacity, bandwidth and energy against a hand calculation', () => {
    const result = projectMemoryTechnology({
      featureSizeNm: 20,
      cellAreaF2: 6,
      arrayEfficiency: 0.5,
      dieAreaMm2: 100,
      ioWidthBits: 256,
      clockGhz: 1,
      dataRate: 2,
      energyPjPerBit: 2,
      refreshOverheadPct: 5,
      modelBytesPerToken: 1e9,
    });

    // cell = 6 * 20^2 = 2400 nm^2; density = 1e6/2400 * 0.5 = 208.3333 Mbit/mm^2.
    expect(result.cellAreaNm2).toBe(2400);
    expect(result.densityMbitPerMm2).toBeCloseTo(208.333333, 5);
    expect(result.capacityMbit).toBeCloseTo(20_833.333333, 5);
    expect(result.capacityBytes).toBeCloseTo(2.60417e9, 0);
    expect(
      Math.abs((result.capacityMib * 1024 ** 2) / result.capacityBytes - 1)
    ).toBeLessThan(1e-5);

    // bandwidth = 256/8 * 1 GHz * 2 = 64 GB/s; per mm^2 = 0.64.
    expect(result.bandwidthGbPerSecond).toBe(64);
    expect(result.bandwidthSource).toBe('derived-from-io-width-and-clock');
    expect(result.bandwidthPerMm2Gbps).toBe(0.64);

    // energy: 2 pJ/bit * 1.05 = 2.1 pJ/bit -> 16.8 pJ/byte -> 1.68e10 pJ/token.
    expect(result.effectiveEnergyPjPerBit).toBe(2.1);
    expect(result.energyPerBytePj).toBe(16.8);
    expect(result.energyPerTokenPj).toBe(1.68e10);

    // tokens/s = 64e9 / 1e9 = 64; power = 64e9 B/s * 8 * 2.1e-12 = 1.0752 W.
    expect(result.tokensPerSecond).toBe(64);
    expect(result.memoryPowerW).toBeCloseTo(1.0752, 9);
    expect(result.tokensPerJoule).toBeCloseTo(64 / 1.0752, 4);
  });

  it('accepts a directly supplied bandwidth and projects weight fit', () => {
    const result = projectMemoryTechnology({
      featureSizeNm: 20,
      cellAreaF2: 6,
      arrayEfficiency: 0.5,
      dieAreaMm2: 100,
      bandwidthGbPerSecond: 128,
      modelBytesPerToken: 1e9,
      modelWeightBytes: 2e9,
    });
    expect(result.bandwidthSource).toBe('supplied');
    expect(result.bandwidthGbPerSecond).toBe(128);
    expect(result.tokensPerSecond).toBe(128);
    expect(result.modelWeightsFit).toBe(true);
    // 2e9 bytes * 8 / (208.3333 Mbit/mm^2 * 1e6) = 76.8 mm^2.
    expect(result.dieAreaForModelWeightsMm2).toBeCloseTo(76.8, 5);
  });

  it('reports weights that do not fit and the area they would need', () => {
    const result = projectMemoryTechnology({
      featureSizeNm: 20,
      dieAreaMm2: 10,
      bandwidthGbPerSecond: 64,
      modelBytesPerToken: 1e9,
      modelWeightBytes: 1e12,
    });
    expect(result.modelWeightsFit).toBe(false);
    expect(result.dieAreaForModelWeightsMm2).toBeGreaterThan(result.dieAreaMm2);
  });

  it('is monotone: higher bandwidth means more projected tokens per second', () => {
    const base = {
      featureSizeNm: 20,
      dieAreaMm2: 100,
      modelBytesPerToken: 1e9,
    };
    const slow = projectMemoryTechnology({ ...base, clockGhz: 1, ioWidthBits: 256 });
    const fast = projectMemoryTechnology({ ...base, clockGhz: 2, ioWidthBits: 256 });
    expect(fast.bandwidthGbPerSecond).toBe(2 * slow.bandwidthGbPerSecond);
    expect(fast.tokensPerSecond).toBe(2 * slow.tokensPerSecond);
  });

  it('is monotone: larger feature size means lower density', () => {
    const base = { dieAreaMm2: 100, bandwidthGbPerSecond: 64, modelBytesPerToken: 1e9 };
    const dense = projectMemoryTechnology({ ...base, featureSizeNm: 20 });
    const sparse = projectMemoryTechnology({ ...base, featureSizeNm: 40 });
    expect(sparse.densityMbitPerMm2).toBeLessThan(dense.densityMbitPerMm2);
    expect(sparse.densityMbitPerMm2).toBeCloseTo(dense.densityMbitPerMm2 / 4, 5);
    expect(sparse.capacityMbit).toBeLessThan(dense.capacityMbit);
  });

  it('is monotone: larger die area means more capacity', () => {
    const base = { featureSizeNm: 20, bandwidthGbPerSecond: 64, modelBytesPerToken: 1e9 };
    const small = projectMemoryTechnology({ ...base, dieAreaMm2: 50 });
    const large = projectMemoryTechnology({ ...base, dieAreaMm2: 200 });
    expect(large.capacityMbit).toBeCloseTo(4 * small.capacityMbit, 3);
  });

  it('states that outputs are a projection, not a measurement', () => {
    const result = projectMemoryTechnology({
      featureSizeNm: 20,
      dieAreaMm2: 100,
      bandwidthGbPerSecond: 64,
      modelBytesPerToken: 1e9,
    });
    expect(result.label).toBe('analytical-estimate');
    expect(result.projectionNotice).toMatch(/projection only/i);
    expect(result.projectionNotice).toMatch(/not measurements/i);
    expect(result.assumptions.length).toBeGreaterThan(0);
    expect(result.limitations.length).toBeGreaterThan(0);
    expect(result.limitations.join(' ')).toMatch(/not a measurement/i);
  });

  it('rejects zero, negative and under-specified inputs through zod', () => {
    const valid = {
      featureSizeNm: 20,
      dieAreaMm2: 100,
      bandwidthGbPerSecond: 64,
      modelBytesPerToken: 1e9,
    };
    expect(memoryTechInputSchema.safeParse(valid).success).toBe(true);
    expect(memoryTechInputSchema.safeParse({ ...valid, featureSizeNm: 0 }).success).toBe(false);
    expect(memoryTechInputSchema.safeParse({ ...valid, featureSizeNm: -20 }).success).toBe(false);
    expect(memoryTechInputSchema.safeParse({ ...valid, dieAreaMm2: 0 }).success).toBe(false);
    expect(memoryTechInputSchema.safeParse({ ...valid, dieAreaMm2: -1 }).success).toBe(false);
    expect(memoryTechInputSchema.safeParse({ ...valid, modelBytesPerToken: 0 }).success).toBe(false);
    expect(memoryTechInputSchema.safeParse({ ...valid, arrayEfficiency: 0 }).success).toBe(false);
    expect(memoryTechInputSchema.safeParse({ ...valid, energyPjPerBit: 0 }).success).toBe(false);
    expect(memoryTechInputSchema.safeParse({ ...valid, refreshOverheadPct: -1 }).success).toBe(
      false
    );
    expect(memoryTechInputSchema.safeParse({ ...valid, refreshOverheadPct: 101 }).success).toBe(
      false
    );
    // Neither a supplied bandwidth nor io width + clock.
    expect(
      memoryTechInputSchema.safeParse({
        featureSizeNm: 20,
        dieAreaMm2: 100,
        modelBytesPerToken: 1e9,
      }).success
    ).toBe(false);
    // io width without clock.
    expect(
      memoryTechInputSchema.safeParse({
        ...valid,
        bandwidthGbPerSecond: undefined,
        ioWidthBits: 256,
      }).success
    ).toBe(false);
  });
});
