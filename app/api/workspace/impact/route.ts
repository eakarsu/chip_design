import { z } from 'zod';
import { workspaceOperation } from '@/lib/commercial/http';
import { createRtlImpact } from '@/lib/commercial/store';

const schema = z.object({
  projectId: z.string().uuid(), baseSha: z.string().regex(/^[0-9a-f]{7,64}$/i), targetSha: z.string().regex(/^[0-9a-f]{7,64}$/i),
  changedModules: z.array(z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_$]{0,127}$/)).min(1).max(100),
  timingDeltaNs: z.number(), powerDeltaPct: z.number(), congestionDeltaPct: z.number(), drcDelta: z.number().int(),
  affectedPaths: z.array(z.string().trim().min(2).max(500)).max(100), evidence: z.array(z.string().trim().min(1).max(500)).min(1).max(20),
});

export async function POST(request: Request) {
  return workspaceOperation(request, 'workspace.impact.create', async (identity, id) => ({ impact: await createRtlImpact(identity, schema.parse(await request.json()), id) }), ['admin', 'editor']);
}
