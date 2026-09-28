import { z } from 'zod';
import {
  ANALYTICAL_ESTIMATE_LABEL,
  ESTIMATE_DISCLAIMER,
  megabytesFromBytes,
  round,
  roundSignificant,
} from './common';

/**
 * Three-level (sensory / short-term / long-term) hierarchical memory model.
 *
 * This is an independent analytical model inspired by hierarchical-memory
 * transformer research directions. It does not implement any published system
 * and it does not produce measured performance. Every output is an estimate
 * derived from the formulas documented below and the caller-supplied constants.
 *
 * Storage formulas (per transformer layer unless stated):
 *   kvBytesPerToken      = 2 * modelDim * bytesPerValue        (one K and one V vector)
 *   sensoryBytes         = sensoryTokens * kvBytesPerToken * layerCount
 *   shortTermBytes       = shortTermSlots * modelDim * bytesPerValue * layerCount
 *   longTermBytes        = longTermSlots * modelDim * bytesPerValue * layerCount
 *   totalMemoryBytes     = sensoryBytes + shortTermBytes + longTermBytes
 *
 * Context compression:
 *   effectiveContextTokens  = sensoryTokens + shortTermSlots + longTermSlots
 *   contextCompressionRatio = sequenceLength / effectiveContextTokens
 *   contextReductionPct     = 100 * (1 - effectiveContextTokens / sequenceLength)
 *
 * Attention cost for a forward pass over one sequence (MACs, one head-equivalent):
 *   baselineAttentionMacs   = layerCount * 2 * sequenceLength^2 * modelDim
 *   compressionMacs         = sequenceLength * modelDim * compressionHiddenDim * 2 * compressionPasses
 *   compressedAttentionMacs = layerCount * 2 * sequenceLength * effectiveContextTokens * modelDim
 *                             + compressionMacs
 *   attentionCostSavingPct  = 100 * (1 - compressedAttentionMacs / baselineAttentionMacs)
 *
 * Decode-step energy for one new token:
 *   attentionMacsPerToken     = layerCount * 2 * effectiveContextTokens * modelDim
 *   compressionMacsPerToken   = modelDim * compressionHiddenDim * 2 * compressionPasses
 *   decodeOpsPerToken         = attentionMacsPerToken + compressionMacsPerToken
 *   decodeMemoryBytesPerToken = layerCount * effectiveContextTokens * kvBytesPerToken
 *   computeEnergyPerTokenJ    = decodeOpsPerToken * energyPerOpJoules
 *   memoryEnergyPerTokenJ     = decodeMemoryBytesPerToken / bytesPerJoule
 *   energyPerTokenJ           = computeEnergyPerTokenJ + memoryEnergyPerTokenJ
 *
 * `energyPerOpJoules` and `bytesPerJoule` are caller-supplied constants. The
 * defaults are illustrative placeholders, not measured device data.
 */
export const hmtInputSchema = z.object({
  modelDim: z.number().int().min(2).max(262_144),
  layerCount: z.number().int().min(1).max(1_024),
  sequenceLength: z.number().int().min(1).max(100_000_000),
  bytesPerValue: z.number().positive().max(8).default(2),
  sensoryTokens: z.number().int().min(1).max(10_000_000).default(1024),
  shortTermSlots: z.number().int().min(0).max(10_000_000).default(256),
  longTermSlots: z.number().int().min(0).max(1_000_000_000).default(1024),
  compressionHiddenDim: z.number().int().min(1).max(262_144).default(128),
  compressionPasses: z.number().int().min(0).max(16).default(1),
  memoryBudgetMb: z.number().positive().max(100_000_000).default(4096),
  energyPerOpJoules: z.number().positive().max(1).default(1e-12),
  bytesPerJoule: z.number().positive().max(1e18).default(3e9),
});

export type HmtInput = z.input<typeof hmtInputSchema>;
export type HmtResolvedInput = z.output<typeof hmtInputSchema>;

export type HmtMemoryLevelName = 'sensory' | 'short-term' | 'long-term';

export interface HmtMemoryLevelStorage {
  level: HmtMemoryLevelName;
  slots: number;
  bitsPerSlot: number;
  bytes: number;
  megabytes: number;
  note: string;
}

export interface HmtMemoryModelResult {
  label: typeof ANALYTICAL_ESTIMATE_LABEL;
  disclaimer: string;
  effectiveContextTokens: number;
  contextCompressionRatio: number;
  contextReductionPct: number;
  levels: HmtMemoryLevelStorage[];
  longTermCapacityRequirementMb: number;
  longTermCapacityRequirementMib: number;
  totalMemoryBytes: number;
  totalMemoryMb: number;
  memoryBudgetMb: number;
  memoryBudgetExceeded: boolean;
  budgetShortfallMb: number;
  baselineAttentionMacs: number;
  compressedAttentionMacs: number;
  compressionMacs: number;
  attentionCostSavingRatio: number;
  attentionCostSavingPct: number;
  decodeOpsPerToken: number;
  decodeMemoryBytesPerToken: number;
  computeEnergyPerTokenJ: number;
  memoryEnergyPerTokenJ: number;
  energyPerTokenJ: number;
  energyPerTokenMillijoules: number;
  tokensPerJoule: number;
  assumptions: string[];
  limitations: string[];
}

export function modelHmtMemory(rawInput: HmtInput): HmtMemoryModelResult {
  const input = hmtInputSchema.parse(rawInput);

  // --- Storage ------------------------------------------------------------
  const kvBytesPerToken = 2 * input.modelDim * input.bytesPerValue;
  const sensoryBytes = input.sensoryTokens * kvBytesPerToken * input.layerCount;
  const shortTermBytes = input.shortTermSlots * input.modelDim * input.bytesPerValue * input.layerCount;
  const longTermBytes = input.longTermSlots * input.modelDim * input.bytesPerValue * input.layerCount;
  const totalMemoryBytes = sensoryBytes + shortTermBytes + longTermBytes;

  const levels: HmtMemoryLevelStorage[] = [
    {
      level: 'sensory',
      slots: input.sensoryTokens,
      bitsPerSlot: kvBytesPerToken * 8,
      bytes: sensoryBytes,
      megabytes: megabytesFromBytes(sensoryBytes),
      note: 'Raw K/V vectors retained verbatim for the current segment, per layer.',
    },
    {
      level: 'short-term',
      slots: input.shortTermSlots,
      bitsPerSlot: input.modelDim * input.bytesPerValue * 8,
      bytes: shortTermBytes,
      megabytes: megabytesFromBytes(shortTermBytes),
      note: 'Compressed recent-context memory slots (one d-vector per slot), per layer.',
    },
    {
      level: 'long-term',
      slots: input.longTermSlots,
      bitsPerSlot: input.modelDim * input.bytesPerValue * 8,
      bytes: longTermBytes,
      megabytes: megabytesFromBytes(longTermBytes),
      note: 'Compressed long-horizon memory slots (one d-vector per slot), per layer.',
    },
  ];

  const memoryBudgetBytes = input.memoryBudgetMb * 1e6;
  const memoryBudgetExceeded = totalMemoryBytes > memoryBudgetBytes;
  const budgetShortfallMb = memoryBudgetExceeded
    ? megabytesFromBytes(totalMemoryBytes - memoryBudgetBytes)
    : 0;

  // --- Context compression ------------------------------------------------
  const effectiveContextTokens = input.sensoryTokens + input.shortTermSlots + input.longTermSlots;
  const contextCompressionRatio = input.sequenceLength / effectiveContextTokens;
  const contextReductionPct = 100 * (1 - effectiveContextTokens / input.sequenceLength);

  // --- Attention cost -----------------------------------------------------
  const baselineAttentionMacs =
    input.layerCount * 2 * input.sequenceLength ** 2 * input.modelDim;
  const compressionMacs =
    input.sequenceLength *
    input.modelDim *
    input.compressionHiddenDim *
    2 *
    input.compressionPasses;
  const compressedAttentionMacs =
    input.layerCount * 2 * input.sequenceLength * effectiveContextTokens * input.modelDim +
    compressionMacs;
  const attentionCostSavingRatio = baselineAttentionMacs / Math.max(1, compressedAttentionMacs);
  const attentionCostSavingPct =
    100 * (1 - compressedAttentionMacs / Math.max(1, baselineAttentionMacs));

  // --- Decode energy ------------------------------------------------------
  const attentionMacsPerToken = input.layerCount * 2 * effectiveContextTokens * input.modelDim;
  const compressionMacsPerToken =
    input.modelDim * input.compressionHiddenDim * 2 * input.compressionPasses;
  const decodeOpsPerToken = attentionMacsPerToken + compressionMacsPerToken;
  const decodeMemoryBytesPerToken = input.layerCount * effectiveContextTokens * kvBytesPerToken;

  const computeEnergyPerTokenJ = decodeOpsPerToken * input.energyPerOpJoules;
  const memoryEnergyPerTokenJ = decodeMemoryBytesPerToken / input.bytesPerJoule;
  const energyPerTokenJ = computeEnergyPerTokenJ + memoryEnergyPerTokenJ;

  return {
    label: ANALYTICAL_ESTIMATE_LABEL,
    disclaimer: ESTIMATE_DISCLAIMER,
    effectiveContextTokens,
    contextCompressionRatio: round(contextCompressionRatio, 6),
    contextReductionPct: round(contextReductionPct, 3),
    levels,
    longTermCapacityRequirementMb: megabytesFromBytes(longTermBytes),
    longTermCapacityRequirementMib: round(longTermBytes / 1024 ** 2, 6),
    totalMemoryBytes,
    totalMemoryMb: megabytesFromBytes(totalMemoryBytes),
    memoryBudgetMb: input.memoryBudgetMb,
    memoryBudgetExceeded,
    budgetShortfallMb,
    baselineAttentionMacs,
    compressedAttentionMacs,
    compressionMacs,
    attentionCostSavingRatio: round(attentionCostSavingRatio, 6),
    attentionCostSavingPct: round(attentionCostSavingPct, 3),
    decodeOpsPerToken,
    decodeMemoryBytesPerToken,
    computeEnergyPerTokenJ: roundSignificant(computeEnergyPerTokenJ),
    memoryEnergyPerTokenJ: roundSignificant(memoryEnergyPerTokenJ),
    energyPerTokenJ: roundSignificant(energyPerTokenJ),
    energyPerTokenMillijoules: roundSignificant(energyPerTokenJ * 1e3),
    tokensPerJoule: roundSignificant(1 / energyPerTokenJ),
    assumptions: [
      'Sensory memory stores raw K and V vectors; short-term and long-term memory each store one d-vector per slot per layer.',
      'The effective attention length is sensoryTokens + shortTermSlots + longTermSlots; queries still number sequenceLength.',
      'Compression is modeled as compressionPasses linear projections of cost 2 * modelDim * compressionHiddenDim MACs per token.',
      'The forward-pass baseline uses 2 * sequenceLength^2 * modelDim MACs per layer (QK^T plus AV), one head-equivalent, no bias or softmax cost.',
      'Decode energy reads the whole retained context per layer per token; weight residency and weight-read energy are excluded.',
      'energyPerOpJoules and bytesPerJoule are caller-supplied constants. Defaults are illustrative placeholders, not measured data.',
    ],
    limitations: [
      'This is a parameter-count and operation-count model, not a kernel-level simulation: memory allocation, paging, and allocator overhead are not modeled.',
      'Quality impact of compression is not modeled at all; compression ratios must be validated against task accuracy separately.',
      'Attention is assumed dense and non-sparse; sparsity, FlashAttention-style tiling, and kernel fusion are not credited.',
      'Energy constants are workload- and technology-dependent; the model is only as good as the supplied joules/op and bytes/J values.',
      'Multi-head attention factors, softmax, normalization, and embedding costs are omitted, so absolute numbers are lower bounds of a full forward pass.',
    ],
  };
}
