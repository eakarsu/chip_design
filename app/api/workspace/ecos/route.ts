import { z } from 'zod';
import { workspaceOperation } from '@/lib/commercial/http';
import { createEco } from '@/lib/commercial/store';

const schema = z.object({
  projectId: z.string().uuid(), title: z.string().trim().min(4).max(180), baselineSha: z.string().regex(/^[0-9a-f]{7,64}$/i), targetSha: z.string().regex(/^[0-9a-f]{7,64}$/i),
  objective: z.string().trim().min(10).max(1200), patch: z.string().min(2).max(500_000), beforeMetrics: z.record(z.number()), afterMetrics: z.record(z.number()),
});

export async function POST(request: Request) {
  return workspaceOperation(request, 'workspace.eco.create', async (identity, id) => ({ eco: await createEco(identity, schema.parse(await request.json()), id) }), ['admin', 'editor']);
}
