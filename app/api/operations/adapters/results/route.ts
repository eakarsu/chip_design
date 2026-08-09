import { z } from 'zod';
import { workspaceOperation } from '@/lib/commercial/http';
import { normalizeAdapterResult } from '@/lib/operations/adapters';
import { createOperationRecord } from '@/lib/operations/store';

const schema = z.object({ projectId: z.string().uuid(), adapterId: z.string().uuid(), result: z.unknown() });

export async function POST(request: Request) {
  return workspaceOperation(
    request,
    'operations.adapter.result',
    async (identity, id) => {
      const input = schema.parse(await request.json());
      const result = normalizeAdapterResult(input.result);
      const record = await createOperationRecord(
        identity,
        {
          projectId: input.projectId,
          category: 'adapter',
          kind: 'normalized-result',
          parentId: input.adapterId,
          title: `${result.tool.product} · ${result.runRef}`,
          status: 'collected',
          payload: result,
          evidence: result.reports.map((report) => `${report.uri}#sha256=${report.sha256}`),
        },
        id
      );
      return { record, normalized: result };
    },
    ['admin', 'editor']
  );
}
