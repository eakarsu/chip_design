/** @jest-environment node */
import {
  compareQuantizationSchemes,
  exploreQuantization,
  quantizationInputSchema,
} from '@/lib/ai-systems/quantization';

function expectRelative(actual: number, expected: number, tolerance = 1e-9) {
  expect(Math.abs(actual / expected - 1)).toBeLessThan(tolerance);
}

describe('ai-systems/quantization explorer', () => {
  it('computes exact weight footprints for fp16, int8 and int4', () => {
    const common = { weightCount: 1_000_000, activationElementsPerToken: 4096 };
    expect(exploreQuantization({ ...common, scheme: 'fp16' }).weightBytes).toBe(2_000_000);
    expect(exploreQuantization({ ...common, scheme: 'int8' }).weightBytes).toBe(1_000_000);
    expect(exploreQuantization({ ...common, scheme: 'int4' }).weightBytes).toBe(500_000);
    expect(exploreQuantization({ ...common, scheme: 'fp16' }).effectiveBitsPerWeight).toBe(16);
    expect(exploreQuantization({ ...common, scheme: 'int8' }).effectiveBitsPerWeight).toBe(8);
    expect(exploreQuantization({ ...common, scheme: 'int4' }).effectiveBitsPerWeight).toBe(4);
  });

  it('spot-checks the vector-quantized footprint against a hand calculation', () => {
    // codebookSize 256 -> indexBits 8; 1024 weights / vectorDim 8 -> 128 vectors;
    // indexBytes = 128; codebookBytes = 256*8*4 = 8192; total 8320 bytes.
    const result = exploreQuantization({
      scheme: 'vq',
      weightCount: 1024,
      activationElementsPerToken: 4096,
      codebookSize: 256,
      vectorDim: 8,
    });
    expect(result.vectorQuantization).toEqual({
      codebookSize: 256,
      vectorDim: 8,
      indexBits: 8,
      vectorCount: 128,
      indexBytes: 128,
      codebookBytes: 8192,
    });
    expect(result.weightBytes).toBe(8320);
    expect(result.effectiveBitsPerWeight).toBe(65);
  });

  it('spot-checks activation bytes, metadata overhead and rotation ops', () => {
    const plain = exploreQuantization({
      scheme: 'int8',
      weightCount: 1_000_000,
      activationElementsPerToken: 4096,
    });
    // 4096 bytes * 1.10 metadata = 4505.6 bytes.
    expect(plain.activationBytesPerToken).toBeCloseTo(4505.6, 6);
    expect(plain.rotationOpsPerToken).toBe(0);

    const rotated = exploreQuantization({
      scheme: 'int8',
      weightCount: 1_000_000,
      activationElementsPerToken: 4096,
      hadamardRotation: true,
      rotationLength: 128,
    });
    // 4096 bytes * 1.02 metadata = 4177.92 bytes; rotation = 4096 * 7 ops.
    expect(rotated.activationBytesPerToken).toBeCloseTo(4177.92, 6);
    expect(rotated.rotationOpsPerToken).toBe(4096 * 7);
    expect(rotated.activationMetadataFraction).toBe(0.02);
    expect(rotated.opsPerToken).toBe(2_000_000 + 4096 * 7);
    expect(rotated.activationBytesPerToken).toBeLessThan(plain.activationBytesPerToken);
  });

  it('spot-checks traffic, bandwidth limit and energy against a hand calculation', () => {
    const result = exploreQuantization({
      scheme: 'int8',
      weightCount: 1_000_000,
      activationElementsPerToken: 4096,
      bandwidthGbPerSecond: 1000,
      energyPerOpJoules: 1e-12,
      bytesPerJoule: 3e9,
    });
    expect(result.bytesPerToken).toBeCloseTo(1_000_000 + 4505.6, 6);
    // 1000 GB/s = 1e12 B/s; 1e12 / 1004505.6 = 995515.066... tokens/s,
    // rounded to 6 significant digits -> 995515.
    expectRelative(result.bandwidthLimitedTokensPerSecond, 1e12 / 1_004_505.6, 1e-6);
    expect(result.tokensPerSecondEstimate).toBe(result.bandwidthLimitedTokensPerSecond);
    // compute = 2e6 ops * 1e-12 J; memory = 1004505.6 / 3e9 J.
    expect(result.computeEnergyPerTokenJ).toBeCloseTo(2e-6, 18);
    expectRelative(result.memoryEnergyPerTokenJ, 1_004_505.6 / 3e9, 1e-6);
    expectRelative(result.totalEnergyPerTokenJ, 2e-6 + 1_004_505.6 / 3e9, 1e-6);
  });

  it('does not model quality unless calibration points are supplied', () => {
    const withoutPoints = exploreQuantization({
      scheme: 'int4',
      weightCount: 1_000_000,
      activationElementsPerToken: 1024,
    });
    expect(withoutPoints.quality.modeled).toBe(false);
    if (!withoutPoints.quality.modeled) {
      expect(withoutPoints.quality.reason).toMatch(/quality not modeled/i);
    }

    const onePoint = exploreQuantization({
      scheme: 'int4',
      weightCount: 1_000_000,
      activationElementsPerToken: 1024,
      calibrationPoints: [{ bitsPerWeight: 4, metric: 0.9 }],
    });
    expect(onePoint.quality.modeled).toBe(false);

    const calibrationPoints = [
      { bitsPerWeight: 4, metric: 0.9 },
      { bitsPerWeight: 8, metric: 0.99 },
      { bitsPerWeight: 16, metric: 0.995 },
    ];
    const int4 = exploreQuantization({
      scheme: 'int4',
      weightCount: 1_000_000,
      activationElementsPerToken: 1024,
      calibrationPoints,
    });
    expect(int4.quality.modeled).toBe(true);
    if (int4.quality.modeled) {
      expect(int4.quality.estimate).toBe(0.9);
      expect(int4.quality.clamped).toBe(true);
      expect(int4.quality.interpolationRangeBits).toEqual([4, 16]);
    }

    const int8 = exploreQuantization({
      scheme: 'int8',
      weightCount: 1_000_000,
      activationElementsPerToken: 1024,
      calibrationPoints,
    });
    expect(int8.quality.modeled).toBe(true);
    if (int8.quality.modeled) {
      expect(int8.quality.estimate).toBe(0.99);
      expect(int8.quality.clamped).toBe(false);
    }
  });

  it('is monotone: higher bandwidth means more tokens per second', () => {
    const slow = exploreQuantization({
      scheme: 'int8',
      weightCount: 1_000_000,
      activationElementsPerToken: 4096,
      bandwidthGbPerSecond: 1000,
    });
    const fast = exploreQuantization({
      scheme: 'int8',
      weightCount: 1_000_000,
      activationElementsPerToken: 4096,
      bandwidthGbPerSecond: 2000,
    });
    expect(fast.bandwidthLimitedTokensPerSecond).toBeGreaterThan(
      slow.bandwidthLimitedTokensPerSecond
    );
    expect(fast.bandwidthLimitedTokensPerSecond / slow.bandwidthLimitedTokensPerSecond).toBeCloseTo(
      2,
      6
    );
  });

  it('is monotone: narrower precision means a smaller footprint', () => {
    const common = { weightCount: 1_000_000, activationElementsPerToken: 4096 };
    const fp16 = exploreQuantization({ ...common, scheme: 'fp16' });
    const int8 = exploreQuantization({ ...common, scheme: 'int8' });
    const int4 = exploreQuantization({ ...common, scheme: 'int4' });
    expect(fp16.weightBytes).toBeGreaterThan(int8.weightBytes);
    expect(int8.weightBytes).toBeGreaterThan(int4.weightBytes);
    expect(fp16.bytesPerToken).toBeGreaterThan(int8.bytesPerToken);
    expect(int8.bytesPerToken).toBeGreaterThan(int4.bytesPerToken);
  });

  it('honors a supplied compute limit when it binds before bandwidth', () => {
    const result = exploreQuantization({
      scheme: 'int8',
      weightCount: 1_000_000,
      activationElementsPerToken: 4096,
      bandwidthGbPerSecond: 100_000,
      computeTops: 1,
    });
    // compute limit = 1e12 / 2e6 = 500000 tokens/s, below the bandwidth limit.
    expect(result.computeLimitedTokensPerSecond).toBeCloseTo(500_000, 3);
    expect(result.tokensPerSecondEstimate).toBeCloseTo(500_000, 3);
  });

  it('compares all four schemes deterministically and labels each as an estimate', () => {
    const rows = compareQuantizationSchemes({
      weightCount: 1_000_000,
      activationElementsPerToken: 4096,
    });
    expect(rows.map((row) => row.scheme)).toEqual(['fp16', 'int8', 'int4', 'vq']);
    expect(rows.every((row) => row.quality.modeled === false)).toBe(true);
    expect(rows[0].effectiveBitsPerWeight).toBe(16);
    expect(rows[1].effectiveBitsPerWeight).toBe(8);
    expect(rows[2].effectiveBitsPerWeight).toBe(4);
  });

  it('rejects zero and negative inputs through zod', () => {
    const valid = {
      scheme: 'int8' as const,
      weightCount: 1_000_000,
      activationElementsPerToken: 4096,
    };
    expect(quantizationInputSchema.safeParse(valid).success).toBe(true);
    expect(quantizationInputSchema.safeParse({ ...valid, weightCount: 0 }).success).toBe(false);
    expect(quantizationInputSchema.safeParse({ ...valid, weightCount: -1 }).success).toBe(false);
    expect(
      quantizationInputSchema.safeParse({ ...valid, activationElementsPerToken: 0 }).success
    ).toBe(false);
    expect(quantizationInputSchema.safeParse({ ...valid, bandwidthGbPerSecond: 0 }).success).toBe(
      false
    );
    expect(quantizationInputSchema.safeParse({ ...valid, vectorDim: 1 }).success).toBe(false);
    expect(quantizationInputSchema.safeParse({ ...valid, codebookSize: 1 }).success).toBe(false);
    expect(quantizationInputSchema.safeParse({ ...valid, energyPerOpJoules: -1e-12 }).success).toBe(
      false
    );
    expect(quantizationInputSchema.safeParse({ ...valid, scheme: 'int2' }).success).toBe(false);
  });

  it('always carries assumptions, limitations and the estimate label', () => {
    const result = exploreQuantization({
      scheme: 'vq',
      weightCount: 65_536,
      activationElementsPerToken: 4096,
    });
    expect(result.label).toBe('analytical-estimate');
    expect(result.assumptions.length).toBeGreaterThan(0);
    expect(result.limitations.length).toBeGreaterThan(0);
    expect(result.limitations.join(' ')).toMatch(/quality degradation is not modeled/i);
  });
});
