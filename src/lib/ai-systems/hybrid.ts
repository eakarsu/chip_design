import { z } from 'zod';
import {
  ANALYTICAL_ESTIMATE_LABEL,
  ESTIMATE_DISCLAIMER,
  round,
  roundSignificant,
} from './common';

/**
 * GPU + FPGA pipeline planner for an LLM memory pipeline (analytical estimate).
 *
 * The planner models a four-stage pipeline — memory preparation/compression,
 * relevance scoring, top-K retrieval, and attention — and splits the stages
 * between a GPU and an FPGA by computational intensity. It is an independent
 * analytical planner inspired by published GPU+FPGA hybrid research
 * directions; it is not an implementation and it reports no measured latency,
 * energy, or cost.
 *
 * Intensity and assignment:
 *   intensityOpsPerByte = opCount / bytesMoved
 *   gpuRidgeOpsPerByte  = gpuPeakTops * 1e12 / (gpuMemoryBandwidthGBps * 1e9)
 *   assignmentRidgeOpsPerByte = caller override, else gpuRidgeOpsPerByte
 *   classification = intensityOpsPerByte >= assignmentRidgeOpsPerByte
 *     ? 'compute-bound' (assigned to GPU)
 *     : 'memory-bound'  (assigned to FPGA)
 *
 * Per-stage latency (seconds before conversion to ms):
 *   gpuLatencyS = max(opCount / (gpuPeakTops * 1e12),
 *                     bytesMoved / (gpuMemoryBandwidthGBps * 1e9))
 *   fpgaLocalLatencyS = max(opCount / (fpgaPeakTops * 1e12),
 *                           bytesMoved / (fpgaMemoryBandwidthGBps * 1e9))
 *   fpgaInterconnectLatencyS = interconnectLatencyUs * 1e-6
 *                              + bytesMoved / (interconnectBandwidthGBps * 1e9)
 *   fpgaLatencyS = fpgaLocalLatencyS + fpgaInterconnectLatencyS
 *
 * Interconnect defaults (resolved per kind when not supplied):
 *   pcie:           fixed 5 us,  64 GB/s,  10 pJ/byte
 *   inter-instance: fixed 100 us, 12.5 GB/s, 30 pJ/byte
 *
 * Aggregation (no inter-stage overlap is credited):
 *   hybridLatencyMs = sum(latencyMs of assigned device per stage)
 *   gpuOnlyLatencyMs = sum(gpuLatencyMs over all stages)
 *   latencySpeedup = gpuOnlyLatencyMs / hybridLatencyMs
 *   energyJ = opCount * deviceEnergyPerOpJoules + bytesMoved * deviceEnergyPerByteJoules
 *             (+ interconnect bytesMoved * interconnectEnergyPjPerByte * 1e-12 on FPGA stages)
 *   gpuDutyFraction = gpuBusyMs / hybridLatencyMs
 *   fpgaDutyFraction = fpgaBusyMs / hybridLatencyMs
 *   hybridCostPerHourUsd = gpuHourlyUsd * gpuDutyFraction + fpgaHourlyUsd * fpgaDutyFraction
 *   tokensPerHour = (3_600_000 / hybridLatencyMs) * tokensPerPipelineRun
 *   costPerMillionTokensUsd = hybridCostPerHourUsd / (tokensPerHour / 1e6)
 *
 * All device constants and hourly prices are caller-supplied. Defaults are
 * illustrative placeholders, not measured device data.
 */
export const hybridStageIdSchema = z.enum([
  'memory-preparation',
  'relevance-scoring',
  'top-k-retrieval',
  'attention',
]);
export type HybridStageId = z.infer<typeof hybridStageIdSchema>;

export const hybridStageSchema = z.object({
  id: hybridStageIdSchema,
  opCount: z.number().positive().finite(),
  bytesMoved: z.number().positive().finite(),
});

export const hybridInterconnectKindSchema = z.enum(['pcie', 'inter-instance']);
export type HybridInterconnectKind = z.infer<typeof hybridInterconnectKindSchema>;

export const hybridPipelineInputSchema = z
  .object({
    stages: z.array(hybridStageSchema).length(4),
    gpuPeakTops: z.number().positive().max(1_000_000).default(500),
    gpuMemoryBandwidthGBps: z.number().positive().max(1_000_000).default(2000),
    gpuEnergyPerOpJoules: z.number().positive().max(1).default(2e-12),
    gpuEnergyPerByteJoules: z.number().positive().max(1).default(2e-11),
    fpgaPeakTops: z.number().positive().max(1_000_000).default(25),
    fpgaMemoryBandwidthGBps: z.number().positive().max(1_000_000).default(100),
    fpgaEnergyPerOpJoules: z.number().positive().max(1).default(5e-12),
    fpgaEnergyPerByteJoules: z.number().positive().max(1).default(5e-11),
    interconnectKind: hybridInterconnectKindSchema.default('pcie'),
    interconnectLatencyUs: z.number().positive().max(10_000_000).optional(),
    interconnectBandwidthGBps: z.number().positive().max(1_000_000).optional(),
    interconnectEnergyPjPerByte: z.number().positive().max(1_000_000).optional(),
    assignmentRidgeOpsPerByte: z.number().positive().max(1e15).optional(),
    gpuHourlyUsd: z.number().positive().max(1_000_000),
    fpgaHourlyUsd: z.number().positive().max(1_000_000),
    tokensPerPipelineRun: z.number().int().min(1).max(1_000_000_000).default(1),
  })
  .superRefine((value, ctx) => {
    const ids = value.stages.map((stage) => stage.id);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['stages'],
        message:
          'stage ids must be unique and cover memory-preparation, relevance-scoring, top-k-retrieval and attention exactly once',
      });
    }
  });

export type HybridPipelineInput = z.input<typeof hybridPipelineInputSchema>;
export type HybridPipelineResolvedInput = z.output<typeof hybridPipelineInputSchema>;

interface InterconnectDefaults {
  latencyUs: number;
  bandwidthGBps: number;
  energyPjPerByte: number;
}

const INTERCONNECT_DEFAULTS: Record<HybridInterconnectKind, InterconnectDefaults> = {
  pcie: { latencyUs: 5, bandwidthGBps: 64, energyPjPerByte: 10 },
  'inter-instance': { latencyUs: 100, bandwidthGBps: 12.5, energyPjPerByte: 30 },
};

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

export interface HybridPipelinePlan {
  label: typeof ANALYTICAL_ESTIMATE_LABEL;
  disclaimer: string;
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
  assumptions: string[];
  limitations: string[];
}

export function planHybridPipeline(rawInput: HybridPipelineInput): HybridPipelinePlan {
  const input = hybridPipelineInputSchema.parse(rawInput);

  const defaults = INTERCONNECT_DEFAULTS[input.interconnectKind];
  const interconnectLatencyUs = input.interconnectLatencyUs ?? defaults.latencyUs;
  const interconnectBandwidthGBps = input.interconnectBandwidthGBps ?? defaults.bandwidthGBps;
  const interconnectEnergyPjPerByte =
    input.interconnectEnergyPjPerByte ?? defaults.energyPjPerByte;

  const gpuRidgeOpsPerByte =
    (input.gpuPeakTops * 1e12) / (input.gpuMemoryBandwidthGBps * 1e9);
  const fpgaRidgeOpsPerByte =
    (input.fpgaPeakTops * 1e12) / (input.fpgaMemoryBandwidthGBps * 1e9);
  const assignmentRidgeOpsPerByte = input.assignmentRidgeOpsPerByte ?? gpuRidgeOpsPerByte;

  const gpuOpsPerSecond = input.gpuPeakTops * 1e12;
  const gpuBytesPerSecond = input.gpuMemoryBandwidthGBps * 1e9;
  const fpgaOpsPerSecond = input.fpgaPeakTops * 1e12;
  const fpgaBytesPerSecond = input.fpgaMemoryBandwidthGBps * 1e9;
  const interconnectBytesPerSecond = interconnectBandwidthGBps * 1e9;

  const stages: HybridStagePlan[] = input.stages.map((stage) => {
    const intensityOpsPerByte = stage.opCount / stage.bytesMoved;
    const classification: HybridStagePlan['classification'] =
      intensityOpsPerByte >= assignmentRidgeOpsPerByte ? 'compute-bound' : 'memory-bound';
    const assignedDevice: HybridStagePlan['assignedDevice'] =
      classification === 'compute-bound' ? 'gpu' : 'fpga';

    const gpuLatencySeconds = Math.max(
      stage.opCount / gpuOpsPerSecond,
      stage.bytesMoved / gpuBytesPerSecond
    );
    const fpgaLocalLatencySeconds = Math.max(
      stage.opCount / fpgaOpsPerSecond,
      stage.bytesMoved / fpgaBytesPerSecond
    );
    const fpgaInterconnectLatencySeconds =
      interconnectLatencyUs * 1e-6 + stage.bytesMoved / interconnectBytesPerSecond;
    const fpgaLatencySeconds = fpgaLocalLatencySeconds + fpgaInterconnectLatencySeconds;

    const gpuLatencyMs = gpuLatencySeconds * 1e3;
    const fpgaLocalLatencyMs = fpgaLocalLatencySeconds * 1e3;
    const fpgaInterconnectLatencyMs = fpgaInterconnectLatencySeconds * 1e3;
    const fpgaLatencyMs = fpgaLatencySeconds * 1e3;
    const latencyMs = assignedDevice === 'gpu' ? gpuLatencyMs : fpgaLatencyMs;

    const gpuEnergyJ =
      stage.opCount * input.gpuEnergyPerOpJoules +
      stage.bytesMoved * input.gpuEnergyPerByteJoules;
    const fpgaEnergyJ =
      stage.opCount * input.fpgaEnergyPerOpJoules +
      stage.bytesMoved * input.fpgaEnergyPerByteJoules +
      stage.bytesMoved * interconnectEnergyPjPerByte * 1e-12;
    const energyJ = assignedDevice === 'gpu' ? gpuEnergyJ : fpgaEnergyJ;

    return {
      id: stage.id,
      opCount: stage.opCount,
      bytesMoved: stage.bytesMoved,
      intensityOpsPerByte: round(intensityOpsPerByte, 6),
      classification,
      assignedDevice,
      gpuLatencyMs: round(gpuLatencyMs, 6),
      fpgaLocalLatencyMs: round(fpgaLocalLatencyMs, 6),
      fpgaInterconnectLatencyMs: round(fpgaInterconnectLatencyMs, 6),
      fpgaLatencyMs: round(fpgaLatencyMs, 6),
      latencyMs: round(latencyMs, 6),
      gpuEnergyJ: roundSignificant(gpuEnergyJ),
      fpgaEnergyJ: roundSignificant(fpgaEnergyJ),
      energyJ: roundSignificant(energyJ),
      note:
        assignedDevice === 'gpu'
          ? `Intensity ${round(intensityOpsPerByte, 3)} ops/B is at or above the assignment ridge point ${round(assignmentRidgeOpsPerByte, 3)} ops/B; assigned to GPU.`
          : `Intensity ${round(intensityOpsPerByte, 3)} ops/B is below the assignment ridge point ${round(assignmentRidgeOpsPerByte, 3)} ops/B; assigned to FPGA with interconnect cost charged per stage.`,
    };
  });

  const gpuBusyMs = stages
    .filter((stage) => stage.assignedDevice === 'gpu')
    .reduce((total, stage) => total + stage.latencyMs, 0);
  const fpgaBusyMs = stages
    .filter((stage) => stage.assignedDevice === 'fpga')
    .reduce((total, stage) => total + stage.latencyMs, 0);
  const hybridLatencyMs = gpuBusyMs + fpgaBusyMs;
  const gpuOnlyLatencyMs = stages.reduce((total, stage) => total + stage.gpuLatencyMs, 0);

  const hybridEnergyJ = stages.reduce((total, stage) => total + stage.energyJ, 0);
  const gpuOnlyEnergyJ = stages.reduce((total, stage) => total + stage.gpuEnergyJ, 0);

  const gpuDutyFraction = gpuBusyMs / hybridLatencyMs;
  const fpgaDutyFraction = fpgaBusyMs / hybridLatencyMs;
  const hybridCostPerHourUsd =
    input.gpuHourlyUsd * gpuDutyFraction + input.fpgaHourlyUsd * fpgaDutyFraction;
  const hybridReservedCostPerHourUsd = input.gpuHourlyUsd + input.fpgaHourlyUsd;
  const gpuOnlyCostPerHourUsd = input.gpuHourlyUsd;

  const pipelinesPerHour = 3_600_000 / hybridLatencyMs;
  const tokensPerHour = pipelinesPerHour * input.tokensPerPipelineRun;
  const costPerMillionTokensUsd = hybridCostPerHourUsd / (tokensPerHour / 1e6);

  const gpuOnlyPipelinesPerHour = 3_600_000 / gpuOnlyLatencyMs;
  const gpuOnlyTokensPerHour = gpuOnlyPipelinesPerHour * input.tokensPerPipelineRun;
  const gpuOnlyCostPerMillionTokensUsd =
    gpuOnlyCostPerHourUsd / (gpuOnlyTokensPerHour / 1e6);

  const bottleneck = stages.reduce((worst, stage) =>
    stage.latencyMs > worst.latencyMs ? stage : worst
  );

  const energySavingRatio = gpuOnlyEnergyJ / Math.max(1e-300, hybridEnergyJ);
  const energySavingPct = 100 * (1 - hybridEnergyJ / Math.max(1e-300, gpuOnlyEnergyJ));
  const latencySpeedup = gpuOnlyLatencyMs / hybridLatencyMs;
  const costSavingPct = 100 * (1 - hybridCostPerHourUsd / gpuOnlyCostPerHourUsd);
  const costPerMillionTokensSavingPct =
    100 * (1 - costPerMillionTokensUsd / gpuOnlyCostPerMillionTokensUsd);

  return {
    label: ANALYTICAL_ESTIMATE_LABEL,
    disclaimer: ESTIMATE_DISCLAIMER,
    gpuRidgeOpsPerByte: round(gpuRidgeOpsPerByte, 6),
    fpgaRidgeOpsPerByte: round(fpgaRidgeOpsPerByte, 6),
    assignmentRidgeOpsPerByte: round(assignmentRidgeOpsPerByte, 6),
    interconnectKind: input.interconnectKind,
    interconnectLatencyUs,
    interconnectBandwidthGBps,
    interconnectEnergyPjPerByte,
    stages,
    hybridLatencyMs: round(hybridLatencyMs, 6),
    gpuOnlyLatencyMs: round(gpuOnlyLatencyMs, 6),
    latencySpeedup: round(latencySpeedup, 6),
    hybridFasterThanGpuOnly: hybridLatencyMs < gpuOnlyLatencyMs,
    hybridEnergyJ: roundSignificant(hybridEnergyJ),
    gpuOnlyEnergyJ: roundSignificant(gpuOnlyEnergyJ),
    energySavingRatio: roundSignificant(energySavingRatio),
    energySavingPct: round(energySavingPct, 3),
    gpuBusyMs: round(gpuBusyMs, 6),
    fpgaBusyMs: round(fpgaBusyMs, 6),
    gpuDutyFraction: round(gpuDutyFraction, 6),
    fpgaDutyFraction: round(fpgaDutyFraction, 6),
    hybridCostPerHourUsd: round(hybridCostPerHourUsd, 6),
    hybridReservedCostPerHourUsd: round(hybridReservedCostPerHourUsd, 6),
    gpuOnlyCostPerHourUsd: round(gpuOnlyCostPerHourUsd, 6),
    costSavingPct: round(costSavingPct, 3),
    tokensPerPipelineRun: input.tokensPerPipelineRun,
    pipelinesPerHour: round(pipelinesPerHour, 6),
    tokensPerHour: round(tokensPerHour, 6),
    costPerMillionTokensUsd: round(costPerMillionTokensUsd, 6),
    gpuOnlyCostPerMillionTokensUsd: round(gpuOnlyCostPerMillionTokensUsd, 6),
    costPerMillionTokensSavingPct: round(costPerMillionTokensSavingPct, 3),
    bottleneckStageId: bottleneck.id,
    assumptions: [
      'Stage assignment is by computational intensity against the GPU ridge point (overridable); memory-bound stages go to the FPGA.',
      'Each stage latency is max(opCount / deviceOpsPerSecond, bytesMoved / deviceBytesPerSecond), with no intra-stage overlap modeling.',
      'Every FPGA stage is charged the configured interconnect fixed latency plus a transfer of its bytesMoved; this is intentionally conservative.',
      `Interconnect defaults for ${input.interconnectKind}: ${defaults.latencyUs} us fixed, ${defaults.bandwidthGBps} GB/s, ${defaults.energyPjPerByte} pJ/byte when not supplied.`,
      'Pipeline latency is the sum of stage latencies; inter-stage overlap, double buffering, and device-parallel execution are not credited.',
      'Cost per hour uses duty-weighted hourly prices, not full reservation of both devices; the reserved-cost figure is reported separately.',
      'Device constants and hourly prices are caller-supplied; defaults are illustrative placeholders, not measured data.',
    ],
    limitations: [
      'This is a roofline-style planner, not a simulator: queues, kernel launch overhead, DMA engines, and multi-stream scheduling are not modeled.',
      'A hybrid split is not guaranteed to beat GPU-only; the model reports latencySpeedup and energySavingPct so a losing split is visible.',
      'bytesMoved is treated as off-device traffic for latency and as device-memory traffic for energy; a real pipeline that keeps intermediates on-chip would pay less.',
      'Per-stage op counts and byte counts must come from profiling or an operator trace; the planner cannot validate them.',
      'Costs ignore idle power, host CPU cost, networking, and procurement amortization.',
    ],
  };
}
