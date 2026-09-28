/**
 * Small JSON fetch helper for the AI-systems analytical models.
 *
 * Every route answers with JSON; validation failures carry
 * `{ error, message, issues: [{ path, message }] }`. The helper turns those
 * into a readable message so panels render the API's own words instead of
 * inventing a reason.
 */

export class ApiError extends Error {
  readonly status: number;
  readonly payload: unknown;

  constructor(message: string, status: number, payload: unknown = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }
}

function issueText(issue: unknown): string {
  if (!issue || typeof issue !== 'object') return String(issue);
  const record = issue as { path?: unknown; message?: unknown };
  const path = typeof record.path === 'string' ? record.path : '';
  const message = typeof record.message === 'string' ? record.message : 'invalid value';
  return path && path !== '(root)' ? `${path}: ${message}` : message;
}

function payloadMessage(payload: unknown, status: number): string {
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    if (Array.isArray(record.issues) && record.issues.length > 0) {
      const issues = record.issues.map(issueText).join('; ');
      const head = typeof record.error === 'string' && record.error.trim() ? `${record.error}: ` : '';
      return `${head}${issues}`;
    }
    if (typeof record.message === 'string' && record.message.trim()) return record.message;
    if (typeof record.error === 'string' && record.error.trim()) return record.error;
  }
  if (typeof payload === 'string' && payload.trim()) return payload;
  return `Request failed (${status})`;
}

export async function apiRequest<T>(url: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      cache: 'no-store',
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'unknown cause';
    throw new ApiError(`Network error: ${detail}`, 0);
  }

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!response.ok) {
    throw new ApiError(payloadMessage(payload, response.status), response.status, payload);
  }
  return payload as T;
}

export function apiPost<T>(url: string, body: unknown): Promise<T> {
  return apiRequest<T>(url, { method: 'POST', body: JSON.stringify(body) });
}
