import { z } from 'zod';
import { workspaceOperation } from '@/lib/commercial/http';
import { projectSignoffMatrix } from '@/lib/operations/store';

export async function GET(request: Request) {
  return workspaceOperation(request, 'operations.signoff', async (identity) => {
    const projectId = z.string().uuid().parse(new URL(request.url).searchParams.get('projectId'));
    return { matrix: await projectSignoffMatrix(identity, projectId) };
  });
}
