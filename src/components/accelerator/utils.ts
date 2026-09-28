/**
 * Formatting and download helpers for the accelerator workspace views.
 *
 * Nothing here computes a measurement; missing values render as an em dash.
 */

export function formatNumber(value: number | null | undefined, digits = 4): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return value.toLocaleString(undefined, { maximumFractionDigits: digits });
}

export function formatBytes(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  if (value < 1024) return `${formatNumber(value, 0)} B`;
  if (value < 1024 ** 2) return `${formatNumber(value / 1024, 2)} KiB`;
  if (value < 1024 ** 3) return `${formatNumber(value / 1024 ** 2, 2)} MiB`;
  return `${formatNumber(value / 1024 ** 3, 3)} GiB`;
}

export function formatPercent(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${formatNumber(value, digits)} %`;
}

export function downloadTextFile(filename: string, content: string, mimeType = 'text/plain'): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
