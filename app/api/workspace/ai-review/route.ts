import { z } from 'zod';
import { createAiDecisionBrief } from '@/lib/commercial/ai';
import { workspaceOperation } from '@/lib/commercial/http';
import { saveDecisionBrief } from '@/lib/commercial/store';

const schema = z.object({ projectId: z.string().uuid(), feature: z.string().trim().min(2).max(100), title: z.string().trim().min(4).max(180), context: z.record(z.unknown()), evidence: z.array(z.string().trim().min(1).max(500)).min(1).max(20) });

export async function POST(request: Request) {
  return workspaceOperation(request, 'workspace.ai.review', async (identity, id) => {
    const input = schema.parse(await request.json());
    return { brief: await saveDecisionBrief(identity, await createAiDecisionBrief(input), id) };
  }, ['admin', 'editor']);
}
