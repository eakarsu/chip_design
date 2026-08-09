import { z } from 'zod';
import { workspaceOperation } from '@/lib/commercial/http';
import { createOperationRecord } from '@/lib/operations/store';

const schema = z.object({
  projectId: z.string().uuid().optional(),
  email: z.string().trim().email().max(320),
  displayName: z.string().trim().min(2).max(160),
  role: z.enum(['admin', 'editor', 'viewer', 'signoff-owner']),
  ownership: z.array(z.enum(['rtl', 'verification', 'physical-design', 'timing', 'power', 'analog', 'signoff'])).min(1),
});

export async function POST(request: Request) {
  return workspaceOperation(
    request,
    'enterprise.member.invite',
    async (identity, id) => {
      const input = schema.parse(await request.json());
      const member = await createOperationRecord(
        identity,
        {
          projectId: input.projectId,
          category: 'enterprise',
          kind: 'member-invitation',
          title: input.displayName,
          status: 'invited',
          ownerId: input.email,
          payload: input,
        },
        id
      );
      return { member, invitationId: member.id };
    },
    ['admin']
  );
}
