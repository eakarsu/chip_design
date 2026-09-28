/**
 * Formatting helpers for the AI-systems analytical model views.
 *
 * Nothing here computes a measurement; missing values render as an em dash.
 */

export function formatNumber(value: number | null | undefined, digits = 4): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return value.toLocaleString(undefined, { maximumFractionDigits: digits });
}

/** Scientific notation for values whose magnitude makes fixed notation useless. */
export function formatSci(value: number | null | undefined, digits = 4): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  if (value === 0) return '0';
  const magnitude = Math.abs(value);
  if (magnitude >= 1e-3 && magnitude < 1e12) return formatNumber(value, digits);
  return value.toExponential(digits);
}

export function formatPercent(value: number | null | undefined, digits = 3): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${formatNumber(value, digits)} %`;
}

export function formatBytes(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  if (value < 1024) return `${formatNumber(value, 0)} B`;
  if (value < 1024 ** 2) return `${formatNumber(value / 1024, 2)} KiB`;
  if (value < 1024 ** 3) return `${formatNumber(value / 1024 ** 2, 2)} MiB`;
  if (value < 1024 ** 4) return `${formatNumber(value / 1024 ** 3, 3)} GiB`;
  return `${formatNumber(value / 1024 ** 4, 3)} TiB`;
}

export function formatRatio(value: number | null | undefined, digits = 4): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${formatNumber(value, digits)}×`;
}

/**
 * Parse an optional integer input. Empty input means "omit and let the API
 * apply its documented default".
 */
export function readOptionalInteger(
  text: string,
  what: string,
  min: number,
  max: number,
): { value?: number; error: string } {
  const trimmed = text.trim();
  if (!trimmed) return { error: '' };
  const value = Number(trimmed);
  if (!Number.isInteger(value) || value < min || value > max) {
    return { error: `${what} must be an integer between ${min} and ${max}.` };
  }
  return { value, error: '' };
}

export function readRequiredInteger(
  text: string,
  what: string,
  min: number,
  max: number,
): { value?: number; error: string } {
  const trimmed = text.trim();
  if (!trimmed) return { error: `${what} is required.` };
  return readOptionalInteger(trimmed, what, min, max);
}

export function readOptionalPositive(
  text: string,
  what: string,
  minExclusive: number,
  max: number,
): { value?: number; error: string } {
  const trimmed = text.trim();
  if (!trimmed) return { error: '' };
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value <= minExclusive || value > max) {
    return { error: `${what} must be a number > ${minExclusive} and ≤ ${max}.` };
  }
  return { value, error: '' };
}

export function readRequiredPositive(
  text: string,
  what: string,
  minExclusive: number,
  max: number,
): { value?: number; error: string } {
  const trimmed = text.trim();
  if (!trimmed) return { error: `${what} is required.` };
  return readOptionalPositive(trimmed, what, minExclusive, max);
}

/** Optional non-negative number with an inclusive bound (e.g. l2-style fields). */
export function readOptionalNonNegative(
  text: string,
  what: string,
  max: number,
): { value?: number; error: string } {
  const trimmed = text.trim();
  if (!trimmed) return { error: '' };
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0 || value > max) {
    return { error: `${what} must be a number between 0 and ${max}.` };
  }
  return { value, error: '' };
}
