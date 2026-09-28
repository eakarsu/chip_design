/** @jest-environment node */
import { lutInferenceInputSchema, modelLutDotProduct } from '@/lib/ai-systems/lutInference';

describe('ai-systems/lutInference LUT dot-product model', () => {
  it('spot-checks table storage, work and energy against a hand calculation', () => {
    const result = modelLutDotProduct({
      vectorDim: 8,
      subvectorDim: 4,
      codebookSize: 16,
      vectorsPerToken: 10,
      sramBudgetKb: 1,
      codebookEntryBytes: 1,
      lutEntryBytes: 1,
      energyPerMacJoules: 1e-12,
      energyPerLookupJoules: 2e-12,
    });

    // Geometry: 2 subvectors; codebook 2*16*4*1 = 128 B; per-query LUT 2*16*1 = 32 B.
    expect(result.subvectorCount).toBe(2);
    expect(result.paddedLastSubvector).toBe(false);
    expect(result.globalCodebookBytes).toBe(128);
    expect(result.perQueryTableBytes).toBe(32);
    expect(result.residentTableBytes).toBe(160);
    expect(result.sramBudgetBytes).toBe(1024);
    expect(result.sramUtilizationPct).toBe(15.625);
    expect(result.maxCodebookSizeWithinSram).toBe(256);

    // Work: MACs = 10*8 = 80; lookups = 10*2 = 20; table build = 2*16*4 = 128 MACs.
    expect(result.macsPerToken).toBe(80);
    expect(result.lookupsPerToken).toBe(20);
    expect(result.tableBuildMacsPerToken).toBe(128);
    expect(result.lookupsPerMacRatio).toBe(0.25);
    expect(result.breakEvenMacsPerLookup).toBe(2);

    // Energy: baseline 80 * 1e-12 = 8e-11 J;
    // LUT = 20*2e-12 + 128*1e-12 = 1.68e-10 J (worse here).
    expect(result.baselineEnergyPerTokenJ).toBeCloseTo(8e-11, 18);
    expect(result.lutEnergyPerTokenJ).toBeCloseTo(1.68e-10, 18);
    expect(result.lutFavored).toBe(false);
    expect(result.energySavingPct).toBe(-110);

    // Throughput projection: 1 lookup/cycle at 1 GHz = 1e9 lookups/s; /20 = 5e7 tokens/s.
    expect(result.projectedLookupsPerSecond).toBe(1e9);
    expect(result.projectedTokensPerSecond).toBe(5e7);
  });

  it('drops the per-query table when table building is disabled', () => {
    const built = modelLutDotProduct({
      vectorDim: 8,
      subvectorDim: 4,
      codebookSize: 16,
      vectorsPerToken: 10,
      sramBudgetKb: 1,
      codebookEntryBytes: 1,
      lutEntryBytes: 1,
      tableBuildPerQuery: true,
    });
    const prebuilt = modelLutDotProduct({
      vectorDim: 8,
      subvectorDim: 4,
      codebookSize: 16,
      vectorsPerToken: 10,
      sramBudgetKb: 1,
      codebookEntryBytes: 1,
      lutEntryBytes: 1,
      tableBuildPerQuery: false,
    });
    expect(prebuilt.perQueryTableBytes).toBe(0);
    expect(prebuilt.residentTableBytes).toBe(128);
    expect(prebuilt.tableBuildMacsPerToken).toBe(0);
    expect(prebuilt.lutEnergyPerTokenJ).toBeCloseTo(4e-11, 18);
    expect(prebuilt.lutFavored).toBe(true);
    expect(prebuilt.energySavingPct).toBe(50);
    expect(prebuilt.residentTableBytes).toBeLessThan(built.residentTableBytes);
  });

  it('flags infeasible tables against the SRAM budget', () => {
    const result = modelLutDotProduct({
      vectorDim: 8,
      subvectorDim: 4,
      codebookSize: 16,
      vectorsPerToken: 10,
      sramBudgetKb: 0.01,
      codebookEntryBytes: 1,
      lutEntryBytes: 1,
    });
    expect(result.feasible).toBe(false);
    expect(result.shortfallBytes).toBeCloseTo(160 - 10.24, 6);
    expect(result.sramUtilizationPct).toBeCloseTo(1562.5, 6);
  });

  it('is monotone: a larger SRAM budget never reduces capacity and eventually becomes feasible', () => {
    const tiny = modelLutDotProduct({
      vectorDim: 64,
      subvectorDim: 8,
      codebookSize: 256,
      vectorsPerToken: 128,
      sramBudgetKb: 0.5,
    });
    const large = modelLutDotProduct({
      vectorDim: 64,
      subvectorDim: 8,
      codebookSize: 256,
      vectorsPerToken: 128,
      sramBudgetKb: 64,
    });
    expect(tiny.feasible).toBe(false);
    expect(large.feasible).toBe(true);
    expect(large.maxCodebookSizeWithinSram).toBeGreaterThan(tiny.maxCodebookSizeWithinSram);
    expect(large.shortfallBytes).toBe(0);
  });

  it('is monotone: larger codebooks and more vectors increase storage and lookups', () => {
    const small = modelLutDotProduct({
      vectorDim: 64,
      subvectorDim: 8,
      codebookSize: 16,
      vectorsPerToken: 128,
      sramBudgetKb: 64,
    });
    const big = modelLutDotProduct({
      vectorDim: 64,
      subvectorDim: 8,
      codebookSize: 256,
      vectorsPerToken: 128,
      sramBudgetKb: 64,
    });
    expect(big.residentTableBytes).toBeGreaterThan(small.residentTableBytes);
    expect(big.sramUtilizationPct).toBeGreaterThan(small.sramUtilizationPct);

    const moreVectors = modelLutDotProduct({
      vectorDim: 64,
      subvectorDim: 8,
      codebookSize: 16,
      vectorsPerToken: 256,
      sramBudgetKb: 64,
    });
    expect(moreVectors.lookupsPerToken).toBeGreaterThan(small.lookupsPerToken);
    expect(moreVectors.macsPerToken).toBeGreaterThan(small.macsPerToken);
  });

  it('marks zero-padded final subvectors when the subvector does not divide the vector', () => {
    const result = modelLutDotProduct({
      vectorDim: 10,
      subvectorDim: 4,
      codebookSize: 16,
      vectorsPerToken: 4,
      sramBudgetKb: 1,
    });
    expect(result.subvectorCount).toBe(3);
    expect(result.paddedLastSubvector).toBe(true);
  });

  it('rejects zero and negative inputs through zod', () => {
    const valid = { vectorDim: 8, subvectorDim: 4, codebookSize: 16, vectorsPerToken: 10 };
    expect(lutInferenceInputSchema.safeParse(valid).success).toBe(true);
    expect(lutInferenceInputSchema.safeParse({ ...valid, vectorDim: 0 }).success).toBe(false);
    expect(lutInferenceInputSchema.safeParse({ ...valid, vectorDim: -8 }).success).toBe(false);
    expect(lutInferenceInputSchema.safeParse({ ...valid, subvectorDim: 0 }).success).toBe(false);
    expect(lutInferenceInputSchema.safeParse({ ...valid, codebookSize: 1 }).success).toBe(false);
    expect(lutInferenceInputSchema.safeParse({ ...valid, vectorsPerToken: 0 }).success).toBe(false);
    expect(lutInferenceInputSchema.safeParse({ ...valid, sramBudgetKb: 0 }).success).toBe(false);
    expect(
      lutInferenceInputSchema.safeParse({ ...valid, energyPerLookupJoules: 0 }).success
    ).toBe(false);
    expect(lutInferenceInputSchema.safeParse({ ...valid, energyPerMacJoules: -1 }).success).toBe(
      false
    );
  });

  it('always carries assumptions, limitations and the estimate label', () => {
    const result = modelLutDotProduct({ vectorDim: 8, subvectorDim: 4, codebookSize: 16 });
    expect(result.label).toBe('analytical-estimate');
    expect(result.assumptions.length).toBeGreaterThan(0);
    expect(result.limitations.length).toBeGreaterThan(0);
  });
});
