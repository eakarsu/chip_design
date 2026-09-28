/**
 * Response types for the AI-systems analytical models.
 *
 * These mirror the JSON returned by `app/api/ai-systems/*` (serializing the
 * result types in `src/lib/ai-systems/*`). Every result carries the
 * `analytical-estimate` label, a disclaimer, assumptions, and limitations.
 */

export interface EstimateMeta {
  label: string;
  disclaimer: string;
  assumptions: string[];
  limitations: string[];
}

/* -------------------------------------------------------------------- HMT */

export interface HmtMemoryLevel {
  level: 'sensory' | 'short-term' | 'long-term';
  slots: number;
  bitsPerSlot: number;
  bytes: number;
  megabytes: number;
  note: string;
}

export interface HmtResponse extends EstimateMeta {
  effectiveContextTokens: number;
  contextCompressionRatio: number;
  contextReductionPct: number;
  levels: HmtMemoryLevel[];
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
}

/* ----------------------------------------------------------- quantization */

export type QuantizationScheme = 'fp16' | 'int8' | 'int4' | 'vq';

export type QuantizationQuality =
  | { modeled: false; reason: string }
  | {
      modeled: true;
      method: string;
      effectiveBitsPerWeight: number;
      estimate: number;
      clamped: boolean;
      calibrationPointCount: number;
      interpolationRangeBits: [number, number];
      note: string;
    };

export interface QuantizationVqDetails {
  codebookSize: number;
  vectorDim: number;
  indexBits: number;
  vectorCount: number;
  indexBytes: number;
  codebookBytes: number;
}

export interface QuantizationResponse extends EstimateMeta {
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
  vectorQuantization?: QuantizationVqDetails;
  quality: QuantizationQuality;
}

export interface QuantizationComparisonRow {
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

export interface QuantizationComparisonResponse extends EstimateMeta {
  mode: 'comparison';
  schemes: QuantizationComparisonRow[];
}

/* -------------------------------------------------------------------- LUT */

export interface LutResponse extends EstimateMeta {
  subvectorCount: number;
  paddedLastSubvector: boolean;
  globalCodebookBytes: number;
  perQueryTableBytes: number;
  residentTableBytes: number;
  tableStorageMegabytes: number;
  sramBudgetBytes: number;
  feasible: boolean;
  sramUtilizationPct: number;
  shortfallBytes: number;
  maxCodebookSizeWithinSram: number;
  macsPerToken: number;
  lookupsPerToken: number;
  tableBuildMacsPerToken: number;
  lookupsPerMacRatio: number;
  breakEvenMacsPerLookup: number;
  lutFavored: boolean;
  baselineEnergyPerTokenJ: number;
  lutEnergyPerTokenJ: number;
  energySavingRatio: number;
  energySavingPct: number;
  projectedLookupsPerSecond: number;
  projectedTokensPerSecond: number;
}

/* ----------------------------------------------------------------- hybrid */

export type HybridStageId = 'memory-preparation' | 'relevance-scoring' | 'top-k-retrieval' | 'attention';
export type HybridInterconnectKind = 'pcie' | 'inter-instance';

export interface HybridStagePlan {
  id: HybridStageId;
  opCount: number;
  bytesMoved: number;
  intensityOpsPerByte: number;
  classification: 'compute-bound' | 'memory-bound';
  assignedDevice: 'gpu' | 'fpga';
  gpuLatencyMs: number;
  fpgaLocalLatencyMs: number;
  fpgaInterconnectLatencyMs: number;
  fpgaLatencyMs: number;
  latencyMs: number;
  gpuEnergyJ: number;
  fpgaEnergyJ: number;
  energyJ: number;
  note: string;
}

export interface HybridResponse extends EstimateMeta {
  gpuRidgeOpsPerByte: number;
  fpgaRidgeOpsPerByte: number;
  assignmentRidgeOpsPerByte: number;
  interconnectKind: HybridInterconnectKind;
  interconnectLatencyUs: number;
  interconnectBandwidthGBps: number;
  interconnectEnergyPjPerByte: number;
  stages: HybridStagePlan[];
  hybridLatencyMs: number;
  gpuOnlyLatencyMs: number;
  latencySpeedup: number;
  hybridFasterThanGpuOnly: boolean;
  hybridEnergyJ: number;
  gpuOnlyEnergyJ: number;
  energySavingRatio: number;
  energySavingPct: number;
  gpuBusyMs: number;
  fpgaBusyMs: number;
  gpuDutyFraction: number;
  fpgaDutyFraction: number;
  hybridCostPerHourUsd: number;
  hybridReservedCostPerHourUsd: number;
  gpuOnlyCostPerHourUsd: number;
  costSavingPct: number;
  tokensPerPipelineRun: number;
  pipelinesPerHour: number;
  tokensPerHour: number;
  costPerMillionTokensUsd: number;
  gpuOnlyCostPerMillionTokensUsd: number;
  costPerMillionTokensSavingPct: number;
  bottleneckStageId: HybridStageId;
}

/* ----------------------------------------------------------- memory tech */

export interface MemoryTechResponse extends EstimateMeta {
  projectionNotice: string;
  cellAreaNm2: number;
  densityMbitPerMm2: number;
  capacityMbit: number;
  capacityBytes: number;
  capacityMib: number;
  capacityGib: number;
  dieAreaMm2: number;
  bandwidthGbPerSecond: number;
  bandwidthSource: 'supplied' | 'derived-from-io-width-and-clock';
  bandwidthPerMm2Gbps: number;
  effectiveEnergyPjPerBit: number;
  energyPerBytePj: number;
  energyPerTokenPj: number;
  modelBytesPerToken: number;
  tokensPerSecond: number;
  memoryPowerW: number;
  tokensPerJoule: number;
  modelWeightsFit?: boolean;
  dieAreaForModelWeightsMm2?: number;
}
