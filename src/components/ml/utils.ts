/**
 * Formatting helpers for the ML predictor workspace views.
 *
 * Nothing here computes a measurement; missing values render as an em dash.
 */

export function formatNumber(value: number | null | undefined, digits = 4): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return value.toLocaleString(undefined, { maximumFractionDigits: digits });
}

export function formatWithUnit(value: number | null | undefined, unit: string, digits = 4): string {
  const text = formatNumber(value, digits);
  return text === '—' ? text : `${text} ${unit}`;
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}
