import { workspaceOperation } from '@/lib/commercial/http';
import { ingestSpiceResults } from '@/lib/operations/store';

export async function POST(request: Request) {
  return workspaceOperation(request, 'operations.spice.results', async (identity, id) =>
    ingestSpiceResults(identity, await request.json(), id), ['admin', 'editor']);
}
