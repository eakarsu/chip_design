export const runtime = 'nodejs';
import { workspaceOperation } from '@/lib/commercial/http';
import { requirementsSchema, icCandidateSchema, type BuckDesign, type SimulationResult, type AiReviewResult, type PcbCheck } from '@/lib/analog/types';
import { deleteProject, getProject, updateProject } from '@/lib/analog/store';

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  const { id } = await context.params;
  return workspaceOperation(request, 'analog.projects.get', async (identity) => {
    const project = getProject(id, identity.tenantId);
    if (!project) throw new Error('Analog project not found');
    return project;
  });
}

export async function PUT(request: Request, context: Context) {
  const { id } = await context.params;
  return workspaceOperation(
    request,
    'analog.projects.update',
    async (identity) => {
      const body = await request.json();
      const project = updateProject(
        id,
        {
          name: typeof body.name === 'string' ? body.name.slice(0, 120) : undefined,
          status: typeof body.status === 'string' ? (body.status as never) : undefined,
          requirements: body.requirements ? requirementsSchema.parse(body.requirements) : undefined,
          selectedIc: body.selectedIc ? icCandidateSchema.parse(body.selectedIc) : undefined,
          design: (body.design as BuckDesign) ?? undefined,
          transient: (body.transient as SimulationResult) ?? undefined,
          ac: (body.ac as SimulationResult) ?? undefined,
          pcbChecks: (body.pcbChecks as PcbCheck[]) ?? undefined,
          review: (body.review as AiReviewResult) ?? undefined,
        },
        identity.tenantId,
      );
      if (!project) throw new Error('Analog project not found');
      return project;
    },
    ['admin', 'editor'],
  );
}

export async function DELETE(request: Request, context: Context) {
  const { id } = await context.params;
  return workspaceOperation(
    request,
    'analog.projects.delete',
    async (identity) => ({ deleted: deleteProject(id, identity.tenantId) }),
    ['admin'],
  );
}
