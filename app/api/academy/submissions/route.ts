import { z } from 'zod';
import { workspaceOperation } from '@/lib/commercial/http';
import { submitAcademyLab } from '@/lib/academy/store';

const schema = z.object({
  labSlug: z.string().trim().min(3).max(140),
  response: z.string().min(20).max(80_000),
  evidence: z.array(z.string().trim().min(2).max(700)).max(20),
}).strict();

export async function POST(request: Request) {
  return workspaceOperation(request, 'academy.lab.submit', async (identity, requestId) => {
    const input = schema.parse(await request.json());
    return { submission: await submitAcademyLab(identity, input, requestId) };
  }, ['admin', 'editor']);
}
