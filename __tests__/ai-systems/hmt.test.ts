/** @jest-environment node */
import { hmtInputSchema, modelHmtMemory } from '@/lib/ai-systems/hmt';

function expectRelative(actual: number, expected: number, tolerance = 1e-9) {
  expect(Math.abs(actual / expected - 1)).toBeLessThan(tolerance);
}

// Hand-checkable fixture: every number below is recomputed by hand in the tests.
const fixture = {
  modelDim: 4,
  layerCount: 2,
  sequenceLength: 8,
  bytesPerValue: 2,
  sensoryTokens: 2,
  shortTermSlots: 1,
  longTermSlots: 1,
  compressionHiddenDim: 2,
  compressionPasses: 1,
  memoryBudgetMb: 0.001,
  energyPerOpJoules: 1e-12,
  bytesPerJoule: 1e9,
};

describe('ai-systems/hmt three-level memory model', () => {
  it('spot-checks every documented formula against a hand calculation', () => {
    const result = modelHmtMemory(fixture);

    // Storage: kvBytesPerToken = 2*4*2 = 16
    // sensory = 2*16*2 = 64, short-term = 1*4*2*2 = 16, long-term = 16.
    expect(result.levels.map((level) => level.bytes)).toEqual([64, 16, 16]);
    expect(result.levels.map((level) => level.bitsPerSlot)).toEqual([128, 64, 64]);
    expect(result.totalMemoryBytes).toBe(96);
    expect(result.longTermCapacityRequirementMb).toBeCloseTo(16 / 1e6, 9);

    // Context: effective = 2+1+1 = 4, ratio = 8/4 = 2, reduction = 50%.
    expect(result.effectiveContextTokens).toBe(4);
    expect(result.contextCompressionRatio).toBe(2);
    expect(result.contextReductionPct).toBe(50);

    // Attention: baseline = 2*2*8^2*4 = 1024;
    // compression = 8*4*2*2*1 = 128; compressed = 2*2*8*4*4 + 128 = 640.
    expect(result.baselineAttentionMacs).toBe(1024);
    expect(result.compressionMacs).toBe(128);
    expect(result.compressedAttentionMacs).toBe(640);
    expect(result.attentionCostSavingPct).toBe(37.5);
    expect(result.attentionCostSavingRatio).toBeCloseTo(1.6, 9);

    // Decode energy: ops = 2*2*4*4 + 4*2*2 = 64 + 16 = 80;
    // memory bytes = 2*4*16 = 128.
    expect(result.decodeOpsPerToken).toBe(80);
    expect(result.decodeMemoryBytesPerToken).toBe(128);
    expect(result.computeEnergyPerTokenJ).toBeCloseTo(8e-11, 18);
    expectRelative(result.memoryEnergyPerTokenJ, 128 / 1e9);
    expectRelative(result.energyPerTokenJ, 8e-11 + 128 / 1e9);

    // Budget: 96 bytes = 9.6e-5 MB < 0.001 MB budget.
    expect(result.memoryBudgetExceeded).toBe(false);
    expect(result.budgetShortfallMb).toBe(0);
  });

  it('labels outputs as estimates and always carries assumptions and limitations', () => {
    const result = modelHmtMemory(fixture);
    expect(result.label).toBe('analytical-estimate');
    expect(result.disclaimer).toMatch(/not measured performance/i);
    expect(result.assumptions.length).toBeGreaterThan(0);
    expect(result.limitations.length).toBeGreaterThan(0);
  });

  it('rejects zero and negative dimensions through zod', () => {
    expect(hmtInputSchema.safeParse({ ...fixture, modelDim: 0 }).success).toBe(false);
    expect(hmtInputSchema.safeParse({ ...fixture, modelDim: -4 }).success).toBe(false);
    expect(hmtInputSchema.safeParse({ ...fixture, layerCount: 0 }).success).toBe(false);
    expect(hmtInputSchema.safeParse({ ...fixture, sequenceLength: 0 }).success).toBe(false);
    expect(hmtInputSchema.safeParse({ ...fixture, bytesPerValue: -2 }).success).toBe(false);
    expect(hmtInputSchema.safeParse({ ...fixture, sensoryTokens: 0 }).success).toBe(false);
    expect(hmtInputSchema.safeParse({ ...fixture, memoryBudgetMb: 0 }).success).toBe(false);
    expect(hmtInputSchema.safeParse({ ...fixture, energyPerOpJoules: 0 }).success).toBe(false);
    expect(hmtInputSchema.safeParse({ ...fixture, bytesPerJoule: -1 }).success).toBe(false);
    expect(() => modelHmtMemory({ ...fixture, modelDim: -1 })).toThrow();
  });

  it('is monotone: more compression means less compressed attention cost', () => {
    const lightCompression = modelHmtMemory({
      ...fixture,
      sequenceLength: 8192,
      shortTermSlots: 256,
      longTermSlots: 1024,
    });
    const heavyCompression = modelHmtMemory({
      ...fixture,
      sequenceLength: 8192,
      shortTermSlots: 4,
      longTermSlots: 16,
    });
    expect(heavyCompression.effectiveContextTokens).toBeLessThan(
      lightCompression.effectiveContextTokens
    );
    expect(heavyCompression.compressedAttentionMacs).toBeLessThan(
      lightCompression.compressedAttentionMacs
    );
    expect(heavyCompression.attentionCostSavingPct).toBeGreaterThan(
      lightCompression.attentionCostSavingPct
    );
  });

  it('is monotone: the longer the raw sequence, the larger the saving from fixed memory', () => {
    const shortSequence = modelHmtMemory({ ...fixture, sequenceLength: 1024 });
    const longSequence = modelHmtMemory({ ...fixture, sequenceLength: 16_384 });
    expect(longSequence.baselineAttentionMacs).toBeGreaterThan(shortSequence.baselineAttentionMacs);
    expect(longSequence.attentionCostSavingPct).toBeGreaterThan(shortSequence.attentionCostSavingPct);
  });

  it('flags a memory budget shortfall deterministically', () => {
    const result = modelHmtMemory({ ...fixture, memoryBudgetMb: 0.00005 });
    expect(result.memoryBudgetExceeded).toBe(true);
    expect(result.budgetShortfallMb).toBeCloseTo((96 - 50) / 1e6, 9);
  });

  it('produces identical output for identical input', () => {
    expect(JSON.stringify(modelHmtMemory(fixture))).toBe(JSON.stringify(modelHmtMemory(fixture)));
  });
});
