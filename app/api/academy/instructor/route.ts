import { z } from 'zod';
import { workspaceOperation } from '@/lib/commercial/http';
import { instructorDashboard, reviewCapstone } from '@/lib/academy/store';

const schema = z.object({
  id: z.string().uuid(),
  status: z.enum(['approved', 'revision-required']),
  feedback: z.string().trim().min(20).max(2_000),
}).strict();

export async function GET(request: Request) {
  return workspaceOperation(request, 'academy.instructor.dashboard', async identity => ({ instructor: await instructorDashboard(identity) }), ['admin']);
}

export async function PATCH(request: Request) {
  return workspaceOperation(request, 'academy.capstone.review', async (identity, requestId) => {
    const input = schema.parse(await request.json());
    await reviewCapstone(identity, input, requestId);
    return { instructor: await instructorDashboard(identity) };
  }, ['admin']);
}
