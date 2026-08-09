import { z } from 'zod';
import { workspaceOperation } from '@/lib/commercial/http';
import { createWorkspaceProject } from '@/lib/commercial/store';

const schema = z.object({
  name: z.string().trim().min(2).max(120), description: z.string().trim().min(5).max(1200),
  repositoryUrl: z.string().url().max(500), defaultBranch: z.string().regex(/^[a-zA-Z0-9._/-]{1,120}$/),
  topModule: z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_$]{0,127}$/), pdkRef: z.string().trim().min(2).max(240),
  status: z.enum(['planning', 'active', 'hold', 'archived']).default('active'),
});

export async function POST(request: Request) {
  return workspaceOperation(request, 'workspace.project.create', async (identity, id) => ({ project: await createWorkspaceProject(identity, schema.parse(await request.json()), id) }), ['admin', 'editor']);
}
