export const runtime = 'nodejs';
import { workspaceOperation } from '@/lib/commercial/http';
import { requirementsSchema } from '@/lib/analog/types';
import { createProject, listProjects } from '@/lib/analog/store';

export async function GET(request: Request) {
  return workspaceOperation(request, 'analog.projects.list', async (identity) => listProjects(identity.tenantId));
}

export async function POST(request: Request) {
  return workspaceOperation(
    request,
    'analog.projects.create',
    async (identity) => {
      const body = await request.json();
      const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim().slice(0, 120) : 'Untitled analog design';
      const requirements = body.requirements ? requirementsSchema.parse(body.requirements) : undefined;
      return createProject({ name, requirements, tenantId: identity.tenantId });
    },
    ['admin', 'editor'],
  );
}
