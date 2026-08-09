import { z } from 'zod';
import { workspaceOperation } from '@/lib/commercial/http';
import { createPpaSnapshot } from '@/lib/commercial/store';

const schema = z.object({
  projectId: z.string().uuid(), commitSha: z.string().regex(/^[0-9a-f]{7,64}$/i), branch: z.string().trim().min(1).max(120),
  message: z.string().trim().min(2).max(500), author: z.string().trim().min(2).max(160),
  areaUm2: z.number().positive(), powerMw: z.number().nonnegative(), wnsNs: z.number(), tnsNs: z.number(),
  drcCount: z.number().int().nonnegative(), congestionPct: z.number().min(0).max(100),
  thresholds: z.object({ areaPct: z.number().nonnegative(), powerPct: z.number().nonnegative(), wnsNs: z.number().nonpositive(), drc: z.number().int().nonnegative(), congestionPct: z.number().nonnegative() }),
  evidence: z.array(z.string().trim().min(1).max(500)).min(1).max(20),
});

export async function POST(request: Request) {
  return workspaceOperation(request, 'workspace.ppa.create', async (identity, id) => ({ snapshot: await createPpaSnapshot(identity, schema.parse(await request.json()), id) }), ['admin', 'editor']);
}
