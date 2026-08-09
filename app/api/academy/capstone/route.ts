import { z } from 'zod';
import { workspaceOperation } from '@/lib/commercial/http';
import { saveCapstone } from '@/lib/academy/store';

const schema = z.object({
  title: z.string().trim().min(3).max(180).optional(),
  specification: z.string().max(30_000),
  architecture: z.string().max(30_000),
  verificationPlan: z.string().max(30_000),
  evidence: z.array(z.string().trim().min(2).max(700)).max(30),
  submit: z.boolean(),
}).strict();

export async function POST(request: Request) {
  return workspaceOperation(request, 'academy.capstone.save', async (identity, requestId) => {
    const input = schema.parse(await request.json());
    return { capstone: await saveCapstone(identity, input, requestId) };
  }, ['admin', 'editor']);
}
