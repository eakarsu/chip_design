import { z } from 'zod';
import { workspaceOperation } from '@/lib/commercial/http';
import { createTutorBrief } from '@/lib/academy/tutor';
import { saveTutorMessage } from '@/lib/academy/store';

const schema = z.object({
  topicSlug: z.string().trim().min(2).max(120),
  labSlug: z.string().trim().min(3).max(140),
  question: z.string().trim().min(8).max(2_000),
  currentDraft: z.string().max(12_000),
  hintLevel: z.union([z.literal(1), z.literal(2), z.literal(3)]),
}).strict();

export async function POST(request: Request) {
  return workspaceOperation(request, 'academy.tutor.coach', async identity => {
    const input = schema.parse(await request.json());
    const result = await createTutorBrief(input);
    await saveTutorMessage(identity, input.topicSlug, input.question, result.brief, result.model);
    return { brief: result.brief, provider: 'OpenRouter', model: result.model };
  }, ['admin', 'editor']);
}
