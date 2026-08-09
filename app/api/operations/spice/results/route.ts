import { z } from 'zod';
import { workspaceOperation } from '@/lib/commercial/http';
import { createOperationRecord, updateOperationRecord } from '@/lib/operations/store';

const resultSchema = z.object({
  pointId: z.string().trim().min(1).max(300),
  status: z.enum(['passed', 'failed', 'convergence-error']),
  measurements: z.record(z.number().finite()),
  worstGoldenDeltaPct: z.number().nonnegative(),
  waveformRef: z.string().trim().min(1).max(1000),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
});
const schema = z.object({
  projectId: z.string().uuid(),
  suiteId: z.string().uuid(),
  results: z.array(resultSchema).min(1).max(10_000),
});

export async function POST(request: Request) {
  return workspaceOperation(
    request,
    'operations.spice.results',
    async (identity, id) => {
      const input = schema.parse(await request.json());
      const failures = input.results.filter((result) => result.status !== 'passed');
      const worstGoldenDeltaPct = Math.max(...input.results.map((result) => result.worstGoldenDeltaPct));
      const resultRecord = await createOperationRecord(
        identity,
        {
          projectId: input.projectId,
          category: 'spice',
          kind: 'result-batch',
          parentId: input.suiteId,
          title: `SPICE results · ${input.results.length} points`,
          status: failures.length ? 'attention' : 'passed',
          payload: {
            results: input.results,
            passed: input.results.length - failures.length,
            failed: failures.length,
            worstGoldenDeltaPct,
          },
          evidence: input.results.map((result) => `${result.waveformRef}#sha256=${result.sha256}`),
        },
        id
      );
      const suite = await updateOperationRecord(
        identity,
        {
          id: input.suiteId,
          status: failures.length ? 'attention' : 'passed',
          payload: { completedPoints: input.results.length, failedPoints: failures.length, worstGoldenDeltaPct },
        },
        id
      );
      return {
        suite,
        resultRecord,
        summary: { passed: input.results.length - failures.length, failed: failures.length, worstGoldenDeltaPct },
      };
    },
    ['admin', 'editor']
  );
}
