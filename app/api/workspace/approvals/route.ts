import { z } from 'zod';
import { workspaceOperation } from '@/lib/commercial/http';
import { createApproval, decideApproval } from '@/lib/commercial/store';

const createSchema = z.object({
  projectId: z.string().uuid(),
  targetType: z.enum(['eco', 'run', 'artifact', 'constraint', 'waiver', 'signoff', 'membership', 'integration']),
  targetId: z.string().uuid(),
  rationale: z.string().trim().min(10).max(1200),
});
const decisionSchema = z.object({
  id: z.string().uuid(),
  decision: z.enum(['approved', 'rejected']),
  rationale: z.string().trim().min(10).max(1200),
});

export async function POST(request: Request) {
  return workspaceOperation(
    request,
    'workspace.approval.request',
    async (identity, id) => ({
      approval: await createApproval(identity, createSchema.parse(await request.json()), id),
    }),
    ['admin', 'editor']
  );
}

export async function PATCH(request: Request) {
  return workspaceOperation(
    request,
    'workspace.approval.decide',
    async (identity, id) => {
      const input = decisionSchema.parse(await request.json());
      return { approval: await decideApproval(identity, input.id, input.decision, input.rationale, id) };
    },
    ['admin']
  );
}
