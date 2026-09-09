import { z } from 'zod';

export const spiceResultSchema = z.object({
  pointId: z.string().trim().min(1).max(300),
  status: z.enum(['passed', 'failed', 'convergence-error']),
  measurements: z.record(z.number().finite()),
  worstGoldenDeltaPct: z.number().finite().nonnegative(),
  waveformRef: z.string().trim().min(1).max(1000),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
});
export const spiceResultsSchema = z
  .object({
    projectId: z.string().uuid(),
    suiteId: z.string().uuid(),
    results: z.array(spiceResultSchema).min(1).max(10_000),
  })
  .strict();

export type SpiceResult = z.infer<typeof spiceResultSchema>;

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}

export function mergeSpiceResults(payload: Record<string, unknown>, incoming: SpiceResult[]) {
  const matrix = z
    .array(z.object({ id: z.string().min(1) }).passthrough())
    .min(1)
    .max(10_000)
    .parse(payload.matrix);
  const ids = new Set(matrix.map((point) => point.id));
  if (ids.size !== matrix.length || payload.totalPoints !== matrix.length)
    throw new Error('SPICE matrix identities or totalPoints are invalid');
  const retained = z.array(spiceResultSchema).parse(payload.pointResults ?? []);
  const byPoint = new Map(retained.map((result) => [result.pointId, result]));
  if (byPoint.size !== retained.length || retained.some((item) => !ids.has(item.pointId)))
    throw new Error('Retained SPICE results do not match the matrix');
  const submitted = new Set<string>();
  const added: SpiceResult[] = [];
  for (const result of incoming) {
    if (!ids.has(result.pointId)) throw new Error(`SPICE point not found in this suite: ${result.pointId}`);
    if (submitted.has(result.pointId)) throw new Error('Duplicate SPICE point in result batch');
    submitted.add(result.pointId);
    const previous = byPoint.get(result.pointId);
    if (previous && canonical(previous) !== canonical(result))
      throw new Error('SPICE point already has a different result; create a new suite for a rerun');
    if (!previous) {
      byPoint.set(result.pointId, result);
      added.push(result);
    }
  }
  const pointResults = [...byPoint.values()];
  const failed = pointResults.filter((item) => item.status !== 'passed').length;
  const completed = pointResults.length;
  const worstGoldenDeltaPct = Math.max(0, ...pointResults.map((item) => item.worstGoldenDeltaPct));
  return {
    added,
    status: failed ? 'attention' : completed === matrix.length ? 'passed' : 'running',
    payload: {
      ...payload,
      pointResults,
      matrix: matrix.map((point) => ({ ...point, status: byPoint.get(point.id)?.status ?? 'queued' })),
      completedPoints: completed,
      failedPoints: failed,
      worstGoldenDeltaPct,
    },
    summary: {
      passed: completed - failed,
      failed,
      completed,
      remaining: matrix.length - completed,
      worstGoldenDeltaPct,
    },
  };
}
