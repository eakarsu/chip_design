import { z } from 'zod';
import {
  ANALYTICAL_ESTIMATE_LABEL,
  ESTIMATE_DISCLAIMER,
  megabytesFromBytes,
  round,
  roundSignificant,
} from './common';

/**
 * LUT-based dot-product model (analytical estimate).
 *
 * Models replacing multiply-accumulate inner products with table lookups over
 * product-quantized subvectors, in the spirit of published LUT/table-lookup
 * inference research. This is an independent energy/storage model: it is not an
 * implementation and it reports no measured throughput or measured energy.
 *
 * Geometry:
 *   subvectorCount = ceil(vectorDim / subvectorDim)          (last subvector may be padded)
 *   globalCodebookBytes = subvectorCount * codebookSize * subvectorDim * codebookEntryBytes
 *   perQueryTableBytes  = tableBuildPerQuery
 *     ? subvectorCount * codebookSize * lutEntryBytes
 *     : 0
 *   residentTableBytes  = globalCodebookBytes + perQueryTableBytes
 *
 * Work per token (symmetric codebook lookup model):
 *   macsPerToken            = vectorsPerToken * vectorDim
 *   lookupsPerToken         = vectorsPerToken * subvectorCount
 *   tableBuildMacsPerToken  = tableBuildPerQuery
 *     ? subvectorCount * codebookSize * subvectorDim
 *     : 0
 *
 * Energy per token:
 *   baselineEnergyPerTokenJ = macsPerToken * energyPerMacJoules
 *   lutEnergyPerTokenJ      = lookupsPerToken * energyPerLookupJoules
 *                             + tableBuildMacsPerToken * energyPerMacJoules
 *   breakEvenMacsPerLookup  = energyPerLookupJoules / energyPerMacJoules
 *
 * Feasibility against on-chip memory:
 *   feasible = residentTableBytes <= sramBudgetKb * 1024
 *   sramUtilizationPct = 100 * residentTableBytes / (sramBudgetKb * 1024)
 *   maxCodebookSizeWithinSram = floor(
 *     sramBudgetBytes / (subvectorCount * (codebookEntryBytes + (tableBuildPerQuery ? lutEntryBytes : 0)))
 *   )
 *
 * Throughput projection:
 *   projectedTokensPerSecond = lookupsPerCycle * clockGhz * 1e9 / lookupsPerToken
 *
 * energyPerMacJoules, energyPerLookupJoules, clockGhz and lookupsPerCycle are
 * caller-supplied constants. Defaults are illustrative placeholders.
 */
export const lutInferenceInputSchema = z.object({
  vectorDim: z.number().int().min(2).max(1_048_576),
  subvectorDim: z.number().int().min(1).max(1_048_576).default(8),
  codebookSize: z.number().int().min(2).max(1_048_576).default(256),
  vectorsPerToken: z.number().int().min(1).max(1_000_000_000).default(1024),
  sramBudgetKb: z.number().positive().max(1_000_000_000).default(1024),
  codebookEntryBytes: z.number().positive().max(16).default(2),
  lutEntryBytes: z.number().positive().max(16).default(2),
  tableBuildPerQuery: z.boolean().default(true),
  energyPerMacJoules: z.number().positive().max(1).default(1e-12),
  energyPerLookupJoules: z.number().positive().max(1).default(2e-12),
  clockGhz: z.number().positive().max(100).default(1),
  lookupsPerCycle: z.number().positive().max(1_024).default(1),
});

export type LutInferenceInput = z.input<typeof lutInferenceInputSchema>;
export type LutInferenceResolvedInput = z.output<typeof lutInferenceInputSchema>;

export interface LutInferenceResult {
  label: typeof ANALYTICAL_ESTIMATE_LABEL;
  disclaimer: string;
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
  assumptions: string[];
  limitations: string[];
}

export function modelLutDotProduct(rawInput: LutInferenceInput): LutInferenceResult {
  const input = lutInferenceInputSchema.parse(rawInput);

  const subvectorCount = Math.ceil(input.vectorDim / input.subvectorDim);
  const paddedLastSubvector = input.vectorDim % input.subvectorDim !== 0;

  // --- Table storage ------------------------------------------------------
  const globalCodebookBytes =
    subvectorCount * input.codebookSize * input.subvectorDim * input.codebookEntryBytes;
  const perQueryTableBytes = input.tableBuildPerQuery
    ? subvectorCount * input.codebookSize * input.lutEntryBytes
    : 0;
  const residentTableBytes = globalCodebookBytes + perQueryTableBytes;
  const sramBudgetBytes = input.sramBudgetKb * 1024;

  const feasible = residentTableBytes <= sramBudgetBytes;
  const sramUtilizationPct = 100 * (residentTableBytes / sramBudgetBytes);
  const shortfallBytes = feasible ? 0 : residentTableBytes - sramBudgetBytes;
  const bytesPerCodebookSlot =
    input.codebookEntryBytes + (input.tableBuildPerQuery ? input.lutEntryBytes : 0);
  const maxCodebookSizeWithinSram = Math.floor(
    sramBudgetBytes / Math.max(1, subvectorCount * bytesPerCodebookSlot)
  );

  // --- Work per token -----------------------------------------------------
  const macsPerToken = input.vectorsPerToken * input.vectorDim;
  const lookupsPerToken = input.vectorsPerToken * subvectorCount;
  const tableBuildMacsPerToken = input.tableBuildPerQuery
    ? subvectorCount * input.codebookSize * input.subvectorDim
    : 0;
  const lookupsPerMacRatio = lookupsPerToken / Math.max(1, macsPerToken);

  // --- Energy -------------------------------------------------------------
  const baselineEnergyPerTokenJ = macsPerToken * input.energyPerMacJoules;
  const lutEnergyPerTokenJ =
    lookupsPerToken * input.energyPerLookupJoules +
    tableBuildMacsPerToken * input.energyPerMacJoules;
  const breakEvenMacsPerLookup = input.energyPerLookupJoules / input.energyPerMacJoules;
  const lutFavored = lutEnergyPerTokenJ < baselineEnergyPerTokenJ;
  // Every factor above is strictly positive, so both denominators are non-zero.
  const energySavingRatio = baselineEnergyPerTokenJ / lutEnergyPerTokenJ;
  const energySavingPct = 100 * (1 - lutEnergyPerTokenJ / baselineEnergyPerTokenJ);

  // --- Throughput projection ---------------------------------------------
  const projectedLookupsPerSecond = input.lookupsPerCycle * input.clockGhz * 1e9;
  const projectedTokensPerSecond = projectedLookupsPerSecond / lookupsPerToken;

  return {
    label: ANALYTICAL_ESTIMATE_LABEL,
    disclaimer: ESTIMATE_DISCLAIMER,
    subvectorCount,
    paddedLastSubvector,
    globalCodebookBytes,
    perQueryTableBytes,
    residentTableBytes,
    tableStorageMegabytes: megabytesFromBytes(residentTableBytes),
    sramBudgetBytes,
    feasible,
    sramUtilizationPct: round(sramUtilizationPct, 4),
    shortfallBytes,
    maxCodebookSizeWithinSram,
    macsPerToken,
    lookupsPerToken,
    tableBuildMacsPerToken,
    lookupsPerMacRatio: round(lookupsPerMacRatio, 6),
    breakEvenMacsPerLookup: round(breakEvenMacsPerLookup, 6),
    lutFavored,
    baselineEnergyPerTokenJ: roundSignificant(baselineEnergyPerTokenJ),
    lutEnergyPerTokenJ: roundSignificant(lutEnergyPerTokenJ),
    energySavingRatio: roundSignificant(energySavingRatio),
    energySavingPct: round(energySavingPct, 3),
    projectedLookupsPerSecond: roundSignificant(projectedLookupsPerSecond),
    projectedTokensPerSecond: roundSignificant(projectedTokensPerSecond),
    assumptions: [
      'Each subvector inner product is replaced by one lookup in a per-query table of subvectorCount * codebookSize entries.',
      'One MAC is assumed to cost energyPerMacJoules and one table lookup energyPerLookupJoules, both caller-supplied.',
      'The per-query table build costs subvectorCount * codebookSize * subvectorDim MACs when tableBuildPerQuery is true.',
      'The codebook and lookup table are assumed resident in on-chip SRAM; the SRAM budget is compared against that resident set only.',
      'The last subvector is zero-padded when subvectorDim does not divide vectorDim.',
      'Projected tokens/s assumes lookupsPerCycle independent lookups per clock at clockGhz and ignores pipeline stalls and bank conflicts.',
    ],
    limitations: [
      'This model does not simulate bank conflicts, table port limits, quantization error, or codebook training.',
      'Energy constants for lookups and MACs are technology- and implementation-dependent; defaults are placeholders, not measurements.',
      'No accuracy or quality impact of the quantization implied by the codebook is modeled.',
      'Whether a lookup actually replaces a MAC depends on the datapath; this model assumes a 1:1 replacement per subvector.',
      'Projected throughput is an upper bound that assumes no memory stalls, no table-build dependency stalls, and perfect pipelining.',
    ],
  };
}
