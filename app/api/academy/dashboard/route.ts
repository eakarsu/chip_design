import { z } from 'zod';
import { workspaceOperation } from '@/lib/commercial/http';
import { academyDashboard, selectAcademyPath } from '@/lib/academy/store';

const pathSchema = z.object({ pathSlug: z.string().trim().min(2).max(100) }).strict();

export async function GET(request: Request) {
  return workspaceOperation(request, 'academy.dashboard', async identity => ({ dashboard: await academyDashboard(identity) }));
}

export async function PATCH(request: Request) {
  return workspaceOperation(request, 'academy.path.select', async (identity, requestId) => {
    const input = pathSchema.parse(await request.json());
    await selectAcademyPath(identity, input.pathSlug, requestId);
    return { dashboard: await academyDashboard(identity) };
  });
}
