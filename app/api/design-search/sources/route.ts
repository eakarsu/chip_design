import { workspaceOperation } from '@/lib/commercial/http';
import { listSearchSources } from '@/lib/design-search/sources';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  return workspaceOperation(request, 'design-search.sources', async (identity) => ({
    projects: await listSearchSources(identity),
  }));
}
