/**
 * Formatting and download helpers for the Analog Power Design Studio views.
 *
 * Nothing here computes a measurement; missing values render as an em dash.
 */

export function formatNumber(value: number | null | undefined, digits = 3): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return value.toLocaleString(undefined, { maximumFractionDigits: digits });
}

export function formatWithUnit(value: number | null | undefined, unit: string, digits = 3): string {
  const text = formatNumber(value, digits);
  return text === '—' ? text : `${text} ${unit}`;
}

export function formatUsd(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return value.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 4 });
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

/**
 * Zod validation errors arrive as the Error message. When it is the serialized
 * issue list, turn it into readable `path: message` lines; otherwise keep the
 * API's own message.
 */
export function issuesToText(message: string): string {
  try {
    const parsed: unknown = JSON.parse(message);
    if (Array.isArray(parsed)) {
      const lines = parsed.map((issue) => {
        if (!issue || typeof issue !== 'object') return String(issue);
        const record = issue as { path?: unknown; message?: unknown };
        const path = Array.isArray(record.path) ? record.path.join('.') : '';
        const text = typeof record.message === 'string' ? record.message : 'Invalid value';
        return path ? `${path}: ${text}` : text;
      });
      if (lines.length) return lines.join('; ');
    }
  } catch {
    /* the message is already human readable */
  }
  return message;
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
