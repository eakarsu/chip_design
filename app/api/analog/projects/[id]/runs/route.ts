export const runtime = 'nodejs';
import { workspaceOperation } from '@/lib/commercial/http';
import { listRuns } from '@/lib/analog/store';

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  const { id } = await context.params;
  return workspaceOperation(request, 'analog.runs.list', async (identity) => listRuns(id, identity.tenantId));
}
