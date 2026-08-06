import 'server-only';

import { randomUUID } from 'crypto';

type Metric = { count: number; errors: number; totalMs: number };
const metrics = new Map<string, Metric>();

export function requestId(request: Request): string {
  const supplied = request.headers.get('x-request-id');
  return supplied && /^[a-zA-Z0-9_.:-]{1,128}$/.test(supplied) ? supplied : randomUUID();
}

export async function observed<T>(operation: string, requestIdValue: string, task: () => Promise<T>): Promise<T> {
  const started = performance.now();
  let failed = false;
  try {
    return await task();
  } catch (error) {
    failed = true;
    console.error(JSON.stringify({ level: 'error', operation, requestId: requestIdValue, message: error instanceof Error ? error.message : String(error) }));
    throw error;
  } finally {
    const elapsed = performance.now() - started;
    const current = metrics.get(operation) ?? { count: 0, errors: 0, totalMs: 0 };
    current.count += 1;
    current.errors += failed ? 1 : 0;
    current.totalMs += elapsed;
    metrics.set(operation, current);
    console.info(JSON.stringify({ level: 'info', operation, requestId: requestIdValue, durationMs: Math.round(elapsed), failed }));
  }
}

export function commercialMetrics(): Record<string, Metric & { averageMs: number }> {
  return Object.fromEntries([...metrics.entries()].map(([name, value]) => [name, {
    ...value,
    averageMs: value.count ? Math.round((value.totalMs / value.count) * 100) / 100 : 0,
  }]));
}
