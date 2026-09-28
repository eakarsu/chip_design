import { z } from 'zod';
import {
  ANALYTICAL_ESTIMATE_LABEL,
  ESTIMATE_DISCLAIMER,
  round,
  roundSignificant,
} from './common';

/**
 * Embedded-DRAM projection calculator (analytical estimate).
 *
 * Projects density, die area, capacity, bandwidth, energy, and tokens/second
 * for an embedded-DRAM macro or array from supplied technology and interface
 * constants. This is an independent projection inspired by published
 * embedded-memory research directions. It is explicitly a projection: it is
 * not a measurement, not a silicon result, and not a datasheet claim.
 *
 * Density:
 *   cellAreaNm2 = cellAreaF2 * featureSizeNm^2
 *   densityMbitPerMm2 = (1e6 / cellAreaNm2) * arrayEfficiency
 *     (1 mm^2 = 1e12 nm^2, divided by 1e6 bits per Mbit)
 *   capacityMbit = densityMbitPerMm2 * dieAreaMm2
 *   capacityBytes = capacityMbit * 1e6 / 8
 *
 * Bandwidth:
 *   bandwidthGbPerSecond = bandwidthGbPerSecond (supplied)
 *     or ioWidthBits / 8 * clockGhz * dataRate
 *   bandwidthPerMm2Gbps = bandwidthGbPerSecond / dieAreaMm2
 *
 * Energy and tokens/second:
 *   effectiveEnergyPjPerBit = energyPjPerBit * (1 + refreshOverheadPct / 100)
 *   energyPerBytePj = 8 * effectiveEnergyPjPerBit
 *   energyPerTokenPj = modelBytesPerToken * energyPerBytePj
 *   tokensPerSecond = bandwidthBytesPerSecond / modelBytesPerToken
 *   memoryPowerW = bandwidthBytesPerSecond * 8 * effectiveEnergyPjPerBit * 1e-12
 *   tokensPerJoule = tokensPerSecond / memoryPowerW
 *
 * All technology constants (feature size, cell area, efficiency, energy per
 * bit, refresh overhead) and the model bytes per token are caller-supplied.
 * Defaults are illustrative placeholders, not measured data.
 */
export const memoryTechInputSchema = z
  .object({
    featureSizeNm: z.number().positive().max(10_000),
    cellAreaF2: z.number().positive().max(10_000).default(6),
    arrayEfficiency: z.number().positive().max(1).default(0.55),
    dieAreaMm2: z.number().positive().max(1_000_000),
    ioWidthBits: z.number().int().positive().max(1_000_000).optional(),
    clockGhz: z.number().positive().max(1_000).optional(),
    dataRate: z.number().positive().max(64).default(2),
    bandwidthGbPerSecond: z.number().positive().max(100_000_000).optional(),
    energyPjPerBit: z.number().positive().max(1_000_000).default(2),
    refreshOverheadPct: z.number().min(0).max(100).default(5),
    modelBytesPerToken: z.number().positive().max(1e15),
    modelWeightBytes: z.number().positive().max(1e18).optional(),
  })
  .superRefine((value, ctx) => {
    const hasBandwidth = value.bandwidthGbPerSecond !== undefined;
    const hasInterface =
      value.ioWidthBits !== undefined && value.clockGhz !== undefined;
    if (!hasBandwidth && !hasInterface) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['bandwidthGbPerSecond'],
        message:
          'supply bandwidthGbPerSecond, or supply both ioWidthBits and clockGhz to derive bandwidth',
      });
    }
  });

export type MemoryTechInput = z.input<typeof memoryTechInputSchema>;
export type MemoryTechResolvedInput = z.output<typeof memoryTechInputSchema>;

export interface MemoryTechProjection {
  label: typeof ANALYTICAL_ESTIMATE_LABEL;
  disclaimer: string;
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
  assumptions: string[];
  limitations: string[];
}

function resolveBandwidth(input: MemoryTechResolvedInput): {
  bandwidthGbPerSecond: number;
  bandwidthSource: MemoryTechProjection['bandwidthSource'];
} {
  if (input.bandwidthGbPerSecond !== undefined) {
    return { bandwidthGbPerSecond: input.bandwidthGbPerSecond, bandwidthSource: 'supplied' };
  }
  if (input.ioWidthBits !== undefined && input.clockGhz !== undefined) {
    const bytesPerClock = input.ioWidthBits / 8;
    return {
      bandwidthGbPerSecond: bytesPerClock * input.clockGhz * input.dataRate,
      bandwidthSource: 'derived-from-io-width-and-clock',
    };
  }
  // Unreachable: memoryTechInputSchema.superRefine rejects this combination.
  throw new Error('bandwidthGbPerSecond or ioWidthBits + clockGhz is required');
}

export function projectMemoryTechnology(rawInput: MemoryTechInput): MemoryTechProjection {
  const input = memoryTechInputSchema.parse(rawInput);
  const { bandwidthGbPerSecond, bandwidthSource } = resolveBandwidth(input);

  // --- Density and capacity ----------------------------------------------
  const cellAreaNm2 = input.cellAreaF2 * input.featureSizeNm ** 2;
  const densityMbitPerMm2 = (1e6 / cellAreaNm2) * input.arrayEfficiency;
  const capacityMbit = densityMbitPerMm2 * input.dieAreaMm2;
  const capacityBytes = (capacityMbit * 1e6) / 8;

  // --- Bandwidth -----------------------------------------------------------
  const bandwidthBytesPerSecond = bandwidthGbPerSecond * 1e9;
  const bandwidthPerMm2Gbps = bandwidthGbPerSecond / input.dieAreaMm2;

  // --- Energy and tokens/second -------------------------------------------
  const effectiveEnergyPjPerBit =
    input.energyPjPerBit * (1 + input.refreshOverheadPct / 100);
  const energyPerBytePj = 8 * effectiveEnergyPjPerBit;
  const energyPerTokenPj = input.modelBytesPerToken * energyPerBytePj;
  const tokensPerSecond = bandwidthBytesPerSecond / input.modelBytesPerToken;
  const memoryPowerW = bandwidthBytesPerSecond * 8 * effectiveEnergyPjPerBit * 1e-12;
  const tokensPerJoule = tokensPerSecond / memoryPowerW;

  const modelWeightsFit =
    input.modelWeightBytes === undefined
      ? undefined
      : input.modelWeightBytes <= capacityBytes;
  const dieAreaForModelWeightsMm2 =
    input.modelWeightBytes === undefined
      ? undefined
      : (input.modelWeightBytes * 8) / (densityMbitPerMm2 * 1e6);

  return {
    label: ANALYTICAL_ESTIMATE_LABEL,
    disclaimer: ESTIMATE_DISCLAIMER,
    projectionNotice:
      'Projection only. Density, capacity, bandwidth, energy, and tokens/second are computed from supplied constants; ' +
      'they are not measurements and not a datasheet.',
    cellAreaNm2: roundSignificant(cellAreaNm2),
    densityMbitPerMm2: round(densityMbitPerMm2, 6),
    capacityMbit: round(capacityMbit, 6),
    capacityBytes: roundSignificant(capacityBytes),
    capacityMib: round(capacityBytes / 1024 ** 2, 6),
    capacityGib: round(capacityBytes / 1024 ** 3, 6),
    dieAreaMm2: input.dieAreaMm2,
    bandwidthGbPerSecond: round(bandwidthGbPerSecond, 6),
    bandwidthSource,
    bandwidthPerMm2Gbps: round(bandwidthPerMm2Gbps, 6),
    effectiveEnergyPjPerBit: round(effectiveEnergyPjPerBit, 6),
    energyPerBytePj: round(energyPerBytePj, 6),
    energyPerTokenPj: roundSignificant(energyPerTokenPj),
    modelBytesPerToken: input.modelBytesPerToken,
    tokensPerSecond: roundSignificant(tokensPerSecond),
    memoryPowerW: roundSignificant(memoryPowerW),
    tokensPerJoule: roundSignificant(tokensPerJoule),
    modelWeightsFit,
    dieAreaForModelWeightsMm2:
      dieAreaForModelWeightsMm2 === undefined
        ? undefined
        : round(dieAreaForModelWeightsMm2, 6),
    assumptions: [
      'Bitcell area is cellAreaF2 * featureSizeNm^2 and only the fraction arrayEfficiency of the die is assumed to hold bitcells.',
      'Capacity = density * dieAreaMm2; periphery, decoders, charge pumps, redundancy, and repair structures are covered only by arrayEfficiency.',
      'Bandwidth is either supplied directly or derived as ioWidthBits / 8 * clockGhz * dataRate.',
      'tokensPerSecond = bandwidthBytesPerSecond / modelBytesPerToken, i.e. every token streams modelBytesPerToken through the memory interface.',
      'Refresh overhead is a flat percentage added to access energy; refresh scheduling conflicts are not modeled.',
      'All constants are caller-supplied; defaults are illustrative placeholders, not measured data.',
    ],
    limitations: [
      'This is a projection from analytical density and interface formulas, not a measurement or a macro-level simulation.',
      'Retention time, temperature dependence, leakage, and technology-specific trench/stack capacitor behavior are not modeled.',
      'Bank conflicts, row activation overhead, refresh stalls, and controller efficiency are not modeled; real bandwidth is lower than the raw interface number.',
      'Yield, defect density, ECC/redundancy area, and design-rule limitations are excluded.',
      'The tokens/second figure is a streaming projection and says nothing about achievable model throughput, which also depends on compute and software.',
    ],
  };
}
