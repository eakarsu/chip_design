/**
 * Small JSON fetch helper for the ML predictor workspace API.
 *
 * Every route answers with JSON; failures answer with `{ error, message? }`
 * (train failures may also carry `availableTargets`). The helper keeps error
 * extraction in one place so panels render the API's own words verbatim.
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

export function isUnauthorized(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}

export function isForbidden(error: unknown): boolean {
  return error instanceof ApiError && error.status === 403;
}

export function isStatus(error: unknown, status: number): boolean {
  return error instanceof ApiError && error.status === status;
}

/** Payload fields this area needs for guidance, kept typed and minimal. */
export interface MlErrorPayload {
  error?: string;
  message?: string;
  availableTargets?: string[];
}

export function errorPayload(error: unknown): MlErrorPayload | null {
  if (!(error instanceof ApiError)) return null;
  const payload = error.payload;
  if (!payload || typeof payload !== 'object') return null;
  return payload as MlErrorPayload;
}

function payloadMessage(payload: unknown, status: number): string {
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
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

export function apiGet<T>(url: string): Promise<T> {
  return apiRequest<T>(url, { method: 'GET' });
}

export function apiPost<T>(url: string, body: unknown): Promise<T> {
  return apiRequest<T>(url, { method: 'POST', body: JSON.stringify(body) });
}
