import { z } from 'zod';
import { workspaceOperation } from '@/lib/commercial/http';
import { createArtifact } from '@/lib/commercial/store';

const schema = z.object({
  projectId: z.string().uuid(), runRef: z.string().trim().min(1).max(240), kind: z.enum(['rtl', 'netlist', 'sdc', 'liberty', 'def', 'gds', 'timing', 'drc', 'power', 'congestion', 'evidence']),
  name: z.string().regex(/^[a-zA-Z0-9_.-]{1,180}$/), content: z.string().max(2_000_000), metadata: z.record(z.unknown()).default({}),
});

export async function POST(request: Request) {
  return workspaceOperation(request, 'workspace.artifact.create', async (identity, id) => ({ artifact: await createArtifact(identity, schema.parse(await request.json()), id) }), ['admin', 'editor']);
}
