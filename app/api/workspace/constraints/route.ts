import { z } from 'zod';
import { workspaceOperation } from '@/lib/commercial/http';
import { createConstraint } from '@/lib/commercial/store';

const schema = z.object({ projectId: z.string().uuid(), name: z.string().trim().min(2).max(120), sdc: z.string().min(10).max(500_000), active: z.boolean().optional() });

export async function POST(request: Request) {
  return workspaceOperation(request, 'workspace.constraint.create', async (identity, id) => ({ constraint: await createConstraint(identity, schema.parse(await request.json()), id) }), ['admin', 'editor']);
}
