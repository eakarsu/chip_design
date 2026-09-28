import { z } from 'zod';
import {
  ANALYTICAL_ESTIMATE_LABEL,
  ESTIMATE_DISCLAIMER,
  linearInterpolate,
  megabytesFromBytes,
  round,
  roundSignificant,
} from './common';

/**
 * Quantization explorer (analytical estimate).
 *
 * Compares FP16 / INT8 / INT4 and vector-quantized (codebook) storage options
 * for weights and activations. This is an independent storage/energy model
 * inspired by published quantization and rotation-preprocessing research
 * directions; it is not an implementation and it reports no measured accuracy
 * or measured performance.
 *
 * Weight footprint:
 *   fp16/int8/int4: weightBytes = weightCount * bytesPerWeight
 *   vq:             indexBits   = ceil(log2(codebookSize))
 *                   vectorCount = ceil(weightCount / vectorDim)
 *                   indexBytes  = ceil(vectorCount * indexBits / 8)
 *                   codebookBytes = codebookSize * vectorDim * 4        (fp32 codebook)
 *                   weightBytes = indexBytes + codebookBytes
 *   effectiveBitsPerWeight = 8 * weightBytes / weightCount
 *
 * Activation footprint per token:
 *   fp16/int8/int4: base = activationElementsPerToken * bytesPerWeight
 *   vq:             base = ceil(ceil(activationElementsPerToken / vectorDim) * indexBits / 8)
 *   activationBytesPerToken = base * (1 + metadataFraction)
 *   metadataFraction = hadamardRotation ? 0.02 : 0.10
 *     Rationale: outlier-heavy activations are assumed to need ~10% extra
 *     per-channel scale/zero-point metadata; a Hadamard rotation is assumed to
 *     spread outliers so ~2% metadata suffices. This is an assumption about
 *     outlier behavior, not a measured result.
 *
 * Traffic, throughput and energy:
 *   bytesPerToken = weightBytes + activationBytesPerToken   (batch 1, weights streamed once)
 *   opsPerToken   = 2 * weightCount + rotationOpsPerToken
 *   rotationOpsPerToken = hadamardRotation
 *     ? activationElementsPerToken * ceil(log2(rotationLength))
 *     : 0
 *   bandwidthLimitedTokensPerSecond = bandwidthBytesPerSecond / bytesPerToken
 *   computeLimitedTokensPerSecond   = computeTops * 1e12 / opsPerToken   (when computeTops supplied)
 *   computeEnergyPerTokenJ = opsPerToken * energyPerOpJoules
 *   memoryEnergyPerTokenJ  = bytesPerToken / bytesPerJoule
 *   totalEnergyPerTokenJ   = computeEnergyPerTokenJ + memoryEnergyPerTokenJ
 *
 * Quality degradation is NOT modeled unless the caller supplies at least two
 * calibration points. When supplied, the model performs deterministic linear
 * interpolation of the caller's metric at the effective bits per weight and
 * clamps outside the supplied range (no extrapolation). The interpolation is
 * only a convenience over caller data; it is not a quality model.
 */
export const quantizationSchemeSchema = z.enum(['fp16', 'int8', 'int4', 'vq']);
export type QuantizationScheme = z.infer<typeof quantizationSchemeSchema>;

export const quantizationCalibrationPointSchema = z.object({
  bitsPerWeight: z.number().positive().max(64),
  metric: z.number().finite(),
});

export const quantizationInputSchema = z.object({
  scheme: quantizationSchemeSchema,
  weightCount: z.number().int().min(1).max(1_000_000_000_000),
  activationElementsPerToken: z.number().int().min(1).max(1_000_000_000_000),
  bandwidthGbPerSecond: z.number().positive().max(1_000_000).default(1000),
  computeTops: z.number().positive().max(1_000_000).optional(),
  energyPerOpJoules: z.number().positive().max(1).default(1e-12),
  bytesPerJoule: z.number().positive().max(1e18).default(3e9),
  hadamardRotation: z.boolean().default(false),
  rotationLength: z.number().int().min(2).max(1_048_576).default(128),
  codebookSize: z.number().int().min(2).max(1_048_576).default(256),
  vectorDim: z.number().int().min(2).max(1_048_576).default(8),
  calibrationPoints: z.array(quantizationCalibrationPointSchema).min(1).max(64).optional(),
});

export type QuantizationInput = z.input<typeof quantizationInputSchema>;
export type QuantizationResolvedInput = z.output<typeof quantizationInputSchema>;

export const quantizationBaseInputSchema = quantizationInputSchema.omit({ scheme: true });
export type QuantizationBaseInput = z.input<typeof quantizationBaseInputSchema>;

export type QuantizationQuality =
  | {
      modeled: false;
      reason: string;
    }
  | {
      modeled: true;
      method: 'linear-interpolation-of-supplied-calibration-points';
      effectiveBitsPerWeight: number;
      estimate: number;
      clamped: boolean;
      calibrationPointCount: number;
      interpolationRangeBits: [number, number];
      note: string;
    };

export interface QuantizationResult {
  label: typeof ANALYTICAL_ESTIMATE_LABEL;
  disclaimer: string;
  scheme: QuantizationScheme;
  weightCount: number;
  weightBytes: number;
  weightMegabytes: number;
  effectiveBitsPerWeight: number;
  bytesPerWeight: number;
  activationBytesPerToken: number;
  activationMetadataFraction: number;
  bytesPerToken: number;
  opsPerToken: number;
  rotationOpsPerToken: number;
  bandwidthGbPerSecond: number;
  bandwidthLimitedTokensPerSecond: number;
  computeLimitedTokensPerSecond?: number;
  tokensPerSecondEstimate: number;
  computeEnergyPerTokenJ: number;
  memoryEnergyPerTokenJ: number;
  totalEnergyPerTokenJ: number;
  energyPerTokenMillijoules: number;
  tokensPerJoule: number;
  vectorQuantization?: {
    codebookSize: number;
    vectorDim: number;
    indexBits: number;
    vectorCount: number;
    indexBytes: number;
    codebookBytes: number;
  };
  quality: QuantizationQuality;
  assumptions: string[];
  limitations: string[];
}

function bytesPerWeightFor(scheme: QuantizationScheme): number {
  switch (scheme) {
    case 'fp16':
      return 2;
    case 'int8':
      return 1;
    case 'int4':
      return 0.5;
    case 'vq':
      return 0;
  }
}

function interpolateQuality(
  input: QuantizationResolvedInput,
  effectiveBitsPerWeight: number
): QuantizationQuality {
  const points = input.calibrationPoints;
  if (!points || points.length === 0) {
    return {
      modeled: false,
      reason: 'quality not modeled: no calibration points supplied',
    };
  }
  if (points.length < 2) {
    return {
      modeled: false,
      reason:
        'quality not modeled: at least two calibration points (bitsPerWeight, metric) are required to interpolate',
    };
  }

  const sorted = [...points].sort((a, b) => a.bitsPerWeight - b.bitsPerWeight);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const range: [number, number] = [first.bitsPerWeight, last.bitsPerWeight];

  let estimate: number;
  let clamped: boolean;
  if (effectiveBitsPerWeight <= first.bitsPerWeight) {
    estimate = first.metric;
    clamped = true;
  } else if (effectiveBitsPerWeight >= last.bitsPerWeight) {
    estimate = last.metric;
    clamped = true;
  } else {
    clamped = false;
    estimate = last.metric;
    for (let index = 1; index < sorted.length; index += 1) {
      const lower = sorted[index - 1];
      const upper = sorted[index];
      if (upper.bitsPerWeight === lower.bitsPerWeight) continue;
      if (effectiveBitsPerWeight <= upper.bitsPerWeight) {
        estimate = linearInterpolate(
          effectiveBitsPerWeight,
          { x: lower.bitsPerWeight, y: lower.metric },
          { x: upper.bitsPerWeight, y: upper.metric }
        );
        break;
      }
    }
  }

  return {
    modeled: true,
    method: 'linear-interpolation-of-supplied-calibration-points',
    effectiveBitsPerWeight: round(effectiveBitsPerWeight, 6),
    estimate: round(estimate, 8),
    clamped,
    calibrationPointCount: sorted.length,
    interpolationRangeBits: range,
    note: clamped
      ? 'Effective bits fall outside the supplied calibration range; the nearest supplied metric is returned without extrapolation.'
      : 'Deterministic linear interpolation between the two supplied calibration points bracketing the effective bits per weight.',
  };
}

export function exploreQuantization(rawInput: QuantizationInput): QuantizationResult {
  const input = quantizationInputSchema.parse(rawInput);

  // --- Weight footprint ---------------------------------------------------
  let weightBytes: number;
  let vectorQuantization: QuantizationResult['vectorQuantization'];
  if (input.scheme === 'vq') {
    const indexBits = Math.ceil(Math.log2(input.codebookSize));
    const vectorCount = Math.ceil(input.weightCount / input.vectorDim);
    const indexBytes = Math.ceil((vectorCount * indexBits) / 8);
    const codebookBytes = input.codebookSize * input.vectorDim * 4;
    weightBytes = indexBytes + codebookBytes;
    vectorQuantization = {
      codebookSize: input.codebookSize,
      vectorDim: input.vectorDim,
      indexBits,
      vectorCount,
      indexBytes,
      codebookBytes,
    };
  } else {
    weightBytes = input.weightCount * bytesPerWeightFor(input.scheme);
  }
  const bytesPerWeight = weightBytes / input.weightCount;
  const effectiveBitsPerWeight = 8 * bytesPerWeight;

  // --- Activation footprint ----------------------------------------------
  const activationMetadataFraction = input.hadamardRotation ? 0.02 : 0.1;
  let activationBaseBytes: number;
  if (input.scheme === 'vq') {
    const indexBits = Math.ceil(Math.log2(input.codebookSize));
    const activationVectors = Math.ceil(input.activationElementsPerToken / input.vectorDim);
    activationBaseBytes = Math.ceil((activationVectors * indexBits) / 8);
  } else {
    activationBaseBytes = input.activationElementsPerToken * bytesPerWeightFor(input.scheme);
  }
  const activationBytesPerToken = activationBaseBytes * (1 + activationMetadataFraction);

  // --- Traffic, throughput, energy ---------------------------------------
  const bytesPerToken = weightBytes + activationBytesPerToken;
  const rotationOpsPerToken = input.hadamardRotation
    ? input.activationElementsPerToken * Math.ceil(Math.log2(Math.max(2, input.rotationLength)))
    : 0;
  const opsPerToken = 2 * input.weightCount + rotationOpsPerToken;

  const bandwidthBytesPerSecond = input.bandwidthGbPerSecond * 1e9;
  const bandwidthLimitedTokensPerSecond = bandwidthBytesPerSecond / bytesPerToken;
  const computeLimitedTokensPerSecond =
    input.computeTops === undefined
      ? undefined
      : (input.computeTops * 1e12) / opsPerToken;
  const tokensPerSecondEstimate =
    computeLimitedTokensPerSecond === undefined
      ? bandwidthLimitedTokensPerSecond
      : Math.min(bandwidthLimitedTokensPerSecond, computeLimitedTokensPerSecond);

  const computeEnergyPerTokenJ = opsPerToken * input.energyPerOpJoules;
  const memoryEnergyPerTokenJ = bytesPerToken / input.bytesPerJoule;
  const totalEnergyPerTokenJ = computeEnergyPerTokenJ + memoryEnergyPerTokenJ;

  return {
    label: ANALYTICAL_ESTIMATE_LABEL,
    disclaimer: ESTIMATE_DISCLAIMER,
    scheme: input.scheme,
    weightCount: input.weightCount,
    weightBytes,
    weightMegabytes: megabytesFromBytes(weightBytes),
    effectiveBitsPerWeight: round(effectiveBitsPerWeight, 6),
    bytesPerWeight: round(bytesPerWeight, 6),
    activationBytesPerToken: round(activationBytesPerToken, 6),
    activationMetadataFraction,
    bytesPerToken: round(bytesPerToken, 6),
    opsPerToken,
    rotationOpsPerToken,
    bandwidthGbPerSecond: input.bandwidthGbPerSecond,
    bandwidthLimitedTokensPerSecond: roundSignificant(bandwidthLimitedTokensPerSecond),
    computeLimitedTokensPerSecond:
      computeLimitedTokensPerSecond === undefined
        ? undefined
        : roundSignificant(computeLimitedTokensPerSecond),
    tokensPerSecondEstimate: roundSignificant(tokensPerSecondEstimate),
    computeEnergyPerTokenJ: roundSignificant(computeEnergyPerTokenJ),
    memoryEnergyPerTokenJ: roundSignificant(memoryEnergyPerTokenJ),
    totalEnergyPerTokenJ: roundSignificant(totalEnergyPerTokenJ),
    energyPerTokenMillijoules: roundSignificant(totalEnergyPerTokenJ * 1e3),
    tokensPerJoule: roundSignificant(1 / totalEnergyPerTokenJ),
    vectorQuantization,
    quality: interpolateQuality(input, effectiveBitsPerWeight),
    assumptions: [
      'Batch size is 1 and every weight byte is streamed once per token; no cross-token weight reuse or cache residency is credited.',
      'bytesPerToken = weightBytes + activationBytesPerToken and tokens/s is the minimum of the bandwidth limit and, when supplied, the compute limit.',
      'opsPerToken = 2 * weightCount (one multiply-accumulate per parameter) plus rotation operations; attention and non-GEMM operators are excluded.',
      'Vector-quantized weights use ceil(log2(codebookSize))-bit indices plus an fp32 codebook; the codebook is counted in the weight footprint.',
      input.hadamardRotation
        ? 'Hadamard rotation is assumed to reduce the activation metadata overhead from 10% to 2% by spreading outliers.'
        : 'Without rotation, outlier-heavy activations are assumed to need 10% extra scale/zero-point metadata.',
      'energyPerOpJoules and bytesPerJoule are caller-supplied constants; defaults are illustrative placeholders.',
    ],
    limitations: [
      'Quality degradation is NOT modeled. The optional interpolation merely reads back the caller\u2019s own calibration points and says nothing about a real model.',
      'No accuracy, perplexity, or task-metric prediction is produced by this module under any configuration.',
      'The activation outlier assumption is a documented modeling choice, not a measured property of any network or accelerator.',
      'Kernel efficiency, sparsity, fused operators, and mixed-precision exceptions (e.g., outlier channels kept in higher precision) are not modeled.',
      'Absolute throughput and energy values depend entirely on supplied constants and on real memory-system behavior that this model does not simulate.',
    ],
  };
}

export interface QuantizationSchemeComparison {
  scheme: QuantizationScheme;
  weightBytes: number;
  weightMegabytes: number;
  effectiveBitsPerWeight: number;
  activationBytesPerToken: number;
  bytesPerToken: number;
  bandwidthLimitedTokensPerSecond: number;
  totalEnergyPerTokenJ: number;
  quality: QuantizationQuality;
}

export function compareQuantizationSchemes(
  rawInput: QuantizationBaseInput
): QuantizationSchemeComparison[] {
  const base = quantizationBaseInputSchema.parse(rawInput);
  return (['fp16', 'int8', 'int4', 'vq'] as const).map((scheme) => {
    const result = exploreQuantization({ ...base, scheme });
    return {
      scheme,
      weightBytes: result.weightBytes,
      weightMegabytes: result.weightMegabytes,
      effectiveBitsPerWeight: result.effectiveBitsPerWeight,
      activationBytesPerToken: result.activationBytesPerToken,
      bytesPerToken: result.bytesPerToken,
      bandwidthLimitedTokensPerSecond: result.bandwidthLimitedTokensPerSecond,
      totalEnergyPerTokenJ: result.totalEnergyPerTokenJ,
      quality: result.quality,
    };
  });
}
