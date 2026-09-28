/**
 * Shared helpers for the AI-systems analytical models.
 *
 * Everything under `src/lib/ai-systems` is an independent analytical model
 * inspired by published research directions (hierarchical-memory transformers,
 * LUT-based inference, GPU+FPGA hybrids, embedded-DRAM projections). None of
 * these modules implements or reproduces a published system, and none of the
 * outputs are measured performance numbers. Every result is labeled as an
 * estimate and carries explicit assumptions and limitations.
 */

export const ANALYTICAL_ESTIMATE_LABEL = 'analytical-estimate' as const;
export type AnalyticalEstimateLabel = typeof ANALYTICAL_ESTIMATE_LABEL;

export const ESTIMATE_DISCLAIMER =
  'Analytical estimate only. Outputs are derived from the documented formulas and caller-supplied ' +
  'constants; they are not measured performance, not a benchmark result, and not a claim about any ' +
  'real device, product, or published system.';

/** Round to a fixed number of decimal digits (deterministic, no randomness). */
export function round(value: number, digits = 3): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

/** Round to a fixed number of significant digits (useful for very small energies). */
export function roundSignificant(value: number, digits = 6): number {
  if (!Number.isFinite(value) || value === 0) return value;
  return Number(value.toPrecision(digits));
}

/** Decimal megabytes: 1 MB = 1e6 bytes. Binary units are reported separately when needed. */
export function megabytesFromBytes(bytes: number, digits = 6): number {
  return round(bytes / 1e6, digits);
}

/** Deterministic linear interpolation between the two bracketing samples. */
export function linearInterpolate(
  x: number,
  lower: { x: number; y: number },
  upper: { x: number; y: number }
): number {
  if (upper.x === lower.x) return lower.y;
  const t = (x - lower.x) / (upper.x - lower.x);
  return lower.y + t * (upper.y - lower.y);
}
