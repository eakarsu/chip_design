import { z } from 'zod';
import { createAiDecisionBrief } from '@/lib/commercial/ai';
import { workspaceOperation } from '@/lib/commercial/http';
import { decideAiReview, projectReviewContext, saveDecisionBrief } from '@/lib/commercial/store';

const schema = z.object({
  projectId: z.string().uuid(),
  feature: z.string().trim().min(2).max(100),
  title: z.string().trim().min(4).max(180),
  context: z.record(z.unknown()).refine(value => JSON.stringify(value).length <= 50_000, 'Context exceeds 50 KB'),
  evidence: z.array(z.string().trim().min(1).max(500)).min(1).max(20),
  reviewRequest: z.object({
    objective: z.string().trim().max(1_200),
    decisionQuestion: z.string().trim().max(800),
    assumptions: z.array(z.string().trim().min(1).max(500)).max(10),
    acceptanceCriteria: z.array(z.string().trim().min(1).max(500)).max(10),
    reviewerContext: z.string().trim().max(2_000),
  }).strict().optional(),
}).strict();

const decisionSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(['accepted', 'rejected']),
  rationale: z.string().trim().min(20).max(1_500),
}).strict();

export async function POST(request: Request) {
  return workspaceOperation(request, 'workspace.ai.review', async (identity, id) => {
    const input = schema.parse(await request.json());
    const workspaceContext = await projectReviewContext(identity, input.projectId, input.feature);
    return { brief: await saveDecisionBrief(identity, await createAiDecisionBrief({ ...input, workspaceContext }), id) };
  }, ['admin', 'editor']);
}

export async function PATCH(request: Request) {
  return workspaceOperation(request, 'workspace.ai.decision', async (identity, id) => {
    const input = decisionSchema.parse(await request.json());
    return { brief: await decideAiReview(identity, input.id, input.status, input.rationale, id) };
  }, ['admin', 'editor']);
}
