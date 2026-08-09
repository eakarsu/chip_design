import { z } from 'zod';
import { workspaceOperation } from '@/lib/commercial/http';
import { createCorner } from '@/lib/commercial/store';

const schema = z.object({
  projectId: z.string().uuid(), constraintSetId: z.string().uuid(), name: z.string().trim().min(2).max(120),
  process: z.string().trim().min(1).max(40), voltage: z.number().positive().max(10), temperature: z.number().min(-273.15).max(500),
  libertyRef: z.string().trim().min(2).max(500), rcCorner: z.string().trim().min(1).max(120), active: z.boolean().optional(),
});

export async function POST(request: Request) {
  return workspaceOperation(request, 'workspace.corner.create', async (identity, id) => ({ corner: await createCorner(identity, schema.parse(await request.json()), id) }), ['admin', 'editor']);
}
