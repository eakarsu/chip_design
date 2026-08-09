import { workspaceOperation } from '@/lib/commercial/http';
import { workspaceBundle } from '@/lib/commercial/store';

export async function GET(request: Request) {
  return workspaceOperation(request, 'workspace.bootstrap', async identity => ({ workspace: await workspaceBundle(identity) }));
}
