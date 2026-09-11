import { z } from 'zod';

export const acceleratorArchitectureInputSchema = z.object({
  matrixM: z.number().int().min(1).max(16_384),
  matrixK: z.number().int().min(1).max(16_384),
  matrixN: z.number().int().min(1).max(16_384),
  batchSize: z.number().int().min(1).max(512),
  precisionBits: z.union([z.literal(4), z.literal(8), z.literal(16)]),
  arrayRows: z.number().int().min(4).max(1024),
  arrayColumns: z.number().int().min(4).max(1024),
  arrayCount: z.number().int().min(1).max(4096),
  clockGhz: z.number().min(0.05).max(10),
  voltage: z.number().min(0.2).max(2.5),
  activityFactor: z.number().min(0.01).max(1),
  localMemoryMib: z.number().min(0.0625).max(65_536),
  offChipBandwidthGBps: z.number().min(0.1).max(100_000),
  logicDepthGates: z.number().int().min(1).max(10_000),
  recurrenceDepthGates: z.number().int().min(0).max(10_000),
  targetLatencyMs: z.number().min(0.0001).max(1_000_000),
  reconfigurationDays: z.number().int().min(1).max(3650),
  productionVolume: z.number().int().min(1).max(1_000_000_000),
  targetHardware: z.enum(['auto', 'asic', 'fpga']),
  organization: z.enum(['coarse-tpu', 'fine-gpu', 'splittable']),
  dataflow: z.enum(['weight-stationary', 'output-stationary']),
  memoryPolicy: z.enum(['scratchpad', 'cache']),
});

export type AcceleratorArchitectureInput = z.infer<typeof acceleratorArchitectureInputSchema>;
export type AcceleratorOrganization = AcceleratorArchitectureInput['organization'];

export interface AcceleratorArchitectureResult {
  organization: AcceleratorOrganization;
  matrixOperations: number;
  macUnits: number;
  peakTops: number;
  arrayUtilizationPct: number;
  arithmeticIntensityOpsPerByte: number;
  bandwidthRoofTops: number;
  sustainedTops: number;
  latencyMs: number;
  meetsLatency: boolean;
  totalTrafficMib: number;
  weightsFitLocally: boolean;
  localWeightFootprintKib: number;
  weightLoadCycles: number;
  arrayBoundaryBandwidthGBps: number;
  computeCommunicationRatio: number;
  relativeAreaIndex: number;
  relativeDynamicPowerIndex: number;
  cycleTimePs: number;
  gatesPerPipelineStage: number;
  recommendedPipelineStages: number;
  recurrenceFmaxGhz?: number;
  recurrenceLimited: boolean;
  deterministicLatency: boolean;
  hardwareRecommendation: 'ASIC' | 'FPGA';
  hardwareRationale: string;
  bottleneck: 'compute' | 'off-chip-bandwidth' | 'feedback-loop-timing';
  assumptions: string[];
  requiredEvidence: string[];
}

export const DEFAULT_ACCELERATOR_ARCHITECTURE_INPUT: AcceleratorArchitectureInput = {
  matrixM: 1024,
  matrixK: 1024,
  matrixN: 1024,
  batchSize: 1,
  precisionBits: 8,
  arrayRows: 64,
  arrayColumns: 64,
  arrayCount: 4,
  clockGhz: 1,
  voltage: 0.8,
  activityFactor: 0.65,
  localMemoryMib: 8,
  offChipBandwidthGBps: 256,
  logicDepthGates: 80,
  recurrenceDepthGates: 20,
  targetLatencyMs: 2,
  reconfigurationDays: 180,
  productionVolume: 100_000,
  targetHardware: 'auto',
  organization: 'splittable',
  dataflow: 'weight-stationary',
  memoryPolicy: 'scratchpad',
};

const GATE_DELAY_PS = 12;
const LOGIC_MARGIN = 0.75;

function round(value: number, digits = 3): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function organizationGeometry(input: AcceleratorArchitectureInput, organization: AcceleratorOrganization) {
  if (organization === 'fine-gpu') {
    // Only split into whole, equally sized subarrays. Flooring a remainder
    // silently removes MACs and makes comparisons use different hardware.
    const split = (size: number) => [4, 3, 2, 1].find((factor) => size % factor === 0 && size / factor >= 8) ?? 1;
    const rowScale = split(input.arrayRows);
    const columnScale = split(input.arrayColumns);
    return {
      rows: Math.max(4, Math.floor(input.arrayRows / rowScale)),
      columns: Math.max(4, Math.floor(input.arrayColumns / columnScale)),
      arrays: input.arrayCount * rowScale * columnScale,
      areaFactor: 1.16,
      powerFactor: 1.12,
    };
  }
  return {
    rows: input.arrayRows,
    columns: input.arrayColumns,
    arrays: input.arrayCount,
    areaFactor: organization === 'splittable' ? 1.08 : 1,
    powerFactor: organization === 'splittable' ? 1.05 : 1,
  };
}

function utilizationFor(
  input: AcceleratorArchitectureInput,
  rows: number,
  columns: number,
  arrays: number
): number {
  const tiles = Math.ceil(input.matrixM / rows) * Math.ceil(input.matrixN / columns) * input.batchSize;
  const waves = Math.ceil(tiles / arrays);
  const waveCycles = input.matrixK + rows + columns - 2;
  const scheduledMacCapacity = waves * waveCycles * arrays * rows * columns;
  const usefulMacs = input.matrixM * input.matrixK * input.matrixN * input.batchSize;
  return Math.min(1, usefulMacs / Math.max(1, scheduledMacCapacity));
}

function hardwareChoice(input: AcceleratorArchitectureInput): { choice: 'ASIC' | 'FPGA'; rationale: string } {
  if (input.targetHardware === 'asic') {
    return { choice: 'ASIC', rationale: 'ASIC was selected explicitly; validate NRE, schedule and workload stability.' };
  }
  if (input.targetHardware === 'fpga') {
    return { choice: 'FPGA', rationale: 'FPGA was selected explicitly; validate LUT/routing overhead and timing closure.' };
  }
  if (input.reconfigurationDays <= 90 || input.productionVolume < 2_000) {
    return {
      choice: 'FPGA',
      rationale: 'Frequent workload changes or low volume favor field programmability despite logic and routing overhead.',
    };
  }
  return {
    choice: 'ASIC',
    rationale: 'Stable workload and production volume favor dedicated gates, lower energy and amortized NRE.',
  };
}

export function evaluateAcceleratorArchitecture(
  rawInput: AcceleratorArchitectureInput,
  organization: AcceleratorOrganization = rawInput.organization
): AcceleratorArchitectureResult {
  const input = acceleratorArchitectureInputSchema.parse(rawInput);
  const geometry = organizationGeometry(input, organization);
  const bytesPerElement = input.precisionBits / 8;
  const matrixOperations = 2 * input.matrixM * input.matrixK * input.matrixN * input.batchSize;
  const macUnits = geometry.rows * geometry.columns * geometry.arrays;
  const peakTops = (macUnits * 2 * input.clockGhz) / 1000;
  const coarseUtilization = utilizationFor(input, geometry.rows, geometry.columns, geometry.arrays);
  const fineGeometry = organizationGeometry(input, 'fine-gpu');
  const fineUtilization = utilizationFor(input, fineGeometry.rows, fineGeometry.columns, fineGeometry.arrays);
  const utilization = organization === 'splittable'
    ? Math.max(coarseUtilization, fineUtilization * 0.97)
    : coarseUtilization;

  const weightBytes = input.matrixK * input.matrixN * bytesPerElement;
  const inputBytes = input.matrixM * input.matrixK * input.batchSize * bytesPerElement;
  const outputBytes = input.matrixM * input.matrixN * input.batchSize * bytesPerElement;
  const localBytes = input.localMemoryMib * 1024 * 1024;
  const weightsFitLocally = weightBytes <= localBytes;
  const weightReloads = input.dataflow === 'weight-stationary'
    ? weightsFitLocally ? 1 : Math.ceil((input.matrixM * input.batchSize) / geometry.rows)
    : input.batchSize;
  const totalTrafficBytes = weightBytes * weightReloads + inputBytes + outputBytes;
  const arithmeticIntensity = matrixOperations / Math.max(1, totalTrafficBytes);
  const bandwidthRoofTops = (input.offChipBandwidthGBps * arithmeticIntensity) / 1000;
  const computeRoofTops = peakTops * utilization;
  const sustainedTops = Math.min(computeRoofTops, bandwidthRoofTops);
  const latencyMs = (matrixOperations / Math.max(1, sustainedTops * 1e12)) * 1000;

  const localWeightFootprintBytes = geometry.rows * geometry.columns * geometry.arrays * bytesPerElement;
  const boundaryBytesPerCycle = geometry.columns * geometry.arrays * bytesPerElement;
  const weightLoadCycles = Math.ceil(weightBytes / Math.max(1, boundaryBytesPerCycle));
  const boundaryBandwidth = boundaryBytesPerCycle * input.clockGhz;

  const cycleTimePs = 1000 / input.clockGhz;
  const gatesPerPipelineStage = Math.max(1, Math.floor((cycleTimePs * LOGIC_MARGIN) / GATE_DELAY_PS));
  const recommendedPipelineStages = Math.max(1, Math.ceil(input.logicDepthGates / gatesPerPipelineStage));
  const recurrenceDelayPs = input.recurrenceDepthGates * GATE_DELAY_PS;
  const recurrenceFmaxGhz = recurrenceDelayPs > 0 ? (1000 * LOGIC_MARGIN) / recurrenceDelayPs : undefined;
  const recurrenceLimited = recurrenceFmaxGhz !== undefined && input.clockGhz > recurrenceFmaxGhz;
  const pipelineRegisterIndex = Math.max(0, recommendedPipelineStages - 1) * macUnits * 0.08;
  const precisionScale = (input.precisionBits / 8) ** 2;
  const relativeAreaIndex = macUnits * precisionScale * geometry.areaFactor
    + input.localMemoryMib * 1024 * 0.06
    + pipelineRegisterIndex;
  const relativeDynamicPowerIndex = input.activityFactor * input.voltage ** 2 * input.clockGhz
    * macUnits * precisionScale * geometry.powerFactor / 1000;
  const hardware = hardwareChoice(input);
  const bottleneck = recurrenceLimited
    ? 'feedback-loop-timing'
    : bandwidthRoofTops < computeRoofTops ? 'off-chip-bandwidth' : 'compute';

  return {
    organization,
    matrixOperations,
    macUnits,
    peakTops: round(peakTops),
    arrayUtilizationPct: round(utilization * 100, 1),
    arithmeticIntensityOpsPerByte: round(arithmeticIntensity, 2),
    bandwidthRoofTops: round(bandwidthRoofTops),
    sustainedTops: round(sustainedTops),
    latencyMs: round(latencyMs, 4),
    meetsLatency: latencyMs <= input.targetLatencyMs && !recurrenceLimited,
    totalTrafficMib: round(totalTrafficBytes / (1024 * 1024), 2),
    weightsFitLocally,
    localWeightFootprintKib: round(localWeightFootprintBytes / 1024, 2),
    weightLoadCycles,
    arrayBoundaryBandwidthGBps: round(boundaryBandwidth, 2),
    computeCommunicationRatio: round(arithmeticIntensity, 2),
    relativeAreaIndex: round(relativeAreaIndex, 1),
    relativeDynamicPowerIndex: round(relativeDynamicPowerIndex, 2),
    cycleTimePs: round(cycleTimePs, 2),
    gatesPerPipelineStage,
    recommendedPipelineStages,
    recurrenceFmaxGhz: recurrenceFmaxGhz === undefined ? undefined : round(recurrenceFmaxGhz),
    recurrenceLimited,
    deterministicLatency: input.memoryPolicy === 'scratchpad',
    hardwareRecommendation: hardware.choice,
    hardwareRationale: hardware.rationale,
    bottleneck,
    assumptions: [
      'Dense GEMM is used as the representative workload; sparsity and operator fusion are not credited.',
      'One MAC performs two operations per cycle and array wavefront fill/drain cycles are included.',
      'Area and dynamic-power values are relative indices, not foundry signoff estimates.',
      `Pipeline guidance assumes ${GATE_DELAY_PS} ps per logic level and ${Math.round((1 - LOGIC_MARGIN) * 100)}% timing margin.`,
      input.memoryPolicy === 'scratchpad'
        ? 'Software schedules explicit local-memory and off-chip transfers.'
        : 'Cache behavior depends on workload history and requires measured miss-rate distributions.',
    ],
    requiredEvidence: [
      'Representative model/operator trace with matrix shapes and batch distribution',
      'SRAM compiler area, timing and power views at the selected process corner',
      'Post-synthesis MAC, pipeline and recurrence timing reports',
      'Measured or simulated off-chip bandwidth efficiency and transfer overlap',
      'Workload-derived activity trace for power estimation',
      hardware.choice === 'FPGA'
        ? 'Placed-and-routed FPGA LUT, register, routing and deterministic-latency report'
        : 'ASIC synthesis, floorplan, clock, power and NRE/volume review',
    ],
  };
}

export function compareAcceleratorOrganizations(input: AcceleratorArchitectureInput): AcceleratorArchitectureResult[] {
  return (['coarse-tpu', 'fine-gpu', 'splittable'] as const).map((organization) =>
    evaluateAcceleratorArchitecture(input, organization)
  );
}

export interface PrecisionSweepPoint {
  precisionBits: 4 | 8 | 16;
  bytesPerElement: number;
  peakTops: number;
  bandwidthRoofTops: number;
  sustainedTops: number;
  arithmeticIntensityOpsPerByte: number;
  bottleneck: AcceleratorArchitectureResult['bottleneck'];
  weightsFitLocally: boolean;
  latencyMs: number;
}

export function analyzePrecisionSweep(rawInput: AcceleratorArchitectureInput): PrecisionSweepPoint[] {
  return ([4, 8, 16] as const).map((precisionBits) => {
    const result = evaluateAcceleratorArchitecture({ ...rawInput, precisionBits });
    const peakTops = round(result.peakTops * (8 / precisionBits));
    const computeRoofTops = peakTops * (result.arrayUtilizationPct / 100);
    const sustainedTops = round(Math.min(computeRoofTops, result.bandwidthRoofTops));
    const bottleneck: AcceleratorArchitectureResult['bottleneck'] = result.recurrenceLimited
      ? 'feedback-loop-timing'
      : result.bandwidthRoofTops < computeRoofTops
        ? 'off-chip-bandwidth'
        : 'compute';
    return {
      precisionBits,
      bytesPerElement: precisionBits / 8,
      peakTops,
      bandwidthRoofTops: result.bandwidthRoofTops,
      sustainedTops,
      arithmeticIntensityOpsPerByte: result.arithmeticIntensityOpsPerByte,
      bottleneck,
      weightsFitLocally: result.weightsFitLocally,
      latencyMs: round((result.matrixOperations / Math.max(1, sustainedTops * 1e12)) * 1000, 4),
    };
  });
}

export interface TileRecommendation {
  rows: number;
  columns: number;
  utilizationPct: number;
  rationale: string;
}

function tileCandidateValues(limit: number, reference: number): number[] {
  const bounded = Math.min(1024, Math.max(4, Math.floor(limit)));
  const values = new Set<number>();
  for (let candidate = 4; candidate <= Math.min(bounded, 32); candidate += 1) values.add(candidate);
  for (let candidate = 4; candidate <= bounded; candidate *= 2) values.add(candidate);
  const divisorLimit = Math.min(reference, bounded);
  for (let divisor = 4; divisor <= divisorLimit; divisor += 1) {
    if (reference % divisor === 0) values.add(divisor);
  }
  values.add(bounded);
  return [...values].filter((candidate) => candidate >= 4 && candidate <= bounded).sort((left, right) => left - right);
}

export function recommendTile(rawInput: AcceleratorArchitectureInput): TileRecommendation {
  const input = acceleratorArchitectureInputSchema.parse(rawInput);
  const rowLimit = Math.min(1024, input.arrayRows);
  const columnLimit = Math.min(1024, input.arrayColumns);
  const rowCandidates = tileCandidateValues(rowLimit, Math.max(input.matrixM, input.matrixK));
  const columnCandidates = tileCandidateValues(columnLimit, Math.max(input.matrixN, input.matrixK));
  let bestRows = rowCandidates[0];
  let bestColumns = columnCandidates[0];
  let bestUtilization = -1;
  let bestSquareness = -Infinity;
  let bestArea = -Infinity;
  for (const rows of rowCandidates) {
    for (const columns of columnCandidates) {
      const candidate = evaluateAcceleratorArchitecture(
        { ...input, arrayRows: rows, arrayColumns: columns },
        input.organization
      );
      const utilization = candidate.arrayUtilizationPct;
      const squareness = -Math.abs(rows - columns);
      const area = rows * columns;
      if (
        utilization > bestUtilization
        || (utilization === bestUtilization && squareness > bestSquareness)
        || (utilization === bestUtilization && squareness === bestSquareness && area > bestArea)
      ) {
        bestRows = rows;
        bestColumns = columns;
        bestUtilization = utilization;
        bestSquareness = squareness;
        bestArea = area;
      }
    }
  }
  return {
    rows: bestRows,
    columns: bestColumns,
    utilizationPct: round(bestUtilization, 1),
    rationale: `Sampled ${rowCandidates.length * columnCandidates.length} candidate tiles within ${rowLimit} × ${columnLimit} upper bounds; ${bestRows} × ${bestColumns} maximizes modeled array utilization while preferring square tiles. Fill/drain and control overhead beyond the analytical model still require simulation.`,
  };
}

export type RooflineRegion = 'compute-bound' | 'memory-bound' | 'balanced';

export interface RooflineClassification {
  region: RooflineRegion;
  intensityOpsPerByte: number;
  ridgePointOpsPerByte: number;
  note: string;
}

export function classifyRoofline(
  rawInput: AcceleratorArchitectureInput,
  organization: AcceleratorOrganization = rawInput.organization
): RooflineClassification {
  const input = acceleratorArchitectureInputSchema.parse(rawInput);
  const result = evaluateAcceleratorArchitecture(input, organization);
  const ridgePointOpsPerByte = round((result.peakTops * 1e12) / (input.offChipBandwidthGBps * 1e9), 2);
  const intensityOpsPerByte = result.arithmeticIntensityOpsPerByte;
  const ratio = intensityOpsPerByte / Math.max(1e-9, ridgePointOpsPerByte);
  const region: RooflineRegion = ratio > 1.1 ? 'compute-bound' : ratio < 0.9 ? 'memory-bound' : 'balanced';
  const comparison = region === 'compute-bound'
    ? 'above the ridge point, so compute and array utilization dominate'
    : region === 'memory-bound'
      ? 'below the ridge point, so off-chip bandwidth and data reuse dominate'
      : 'at the ridge point, so compute and bandwidth must be co-designed';
  return {
    region,
    intensityOpsPerByte,
    ridgePointOpsPerByte,
    note: `Arithmetic intensity ${intensityOpsPerByte} ops/B is ${comparison}: ridge point ${ridgePointOpsPerByte} ops/B.`,
  };
}
