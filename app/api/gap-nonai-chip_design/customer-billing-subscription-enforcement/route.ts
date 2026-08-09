import { z } from 'zod';
import { workspaceOperation } from '@/lib/commercial/http';
import { createOperationRecord } from '@/lib/operations/store';

const schema = z.object({
  projectId: z.string().uuid().optional(),
  plan: z.enum(['evaluation', 'team', 'enterprise']),
  monthlyCpuHours: z.number().int().positive().max(1_000_000),
  storageGb: z.number().int().positive().max(1_000_000),
  enforceHardLimit: z.boolean(),
  billingOwner: z.string().trim().min(3).max(200),
});

export async function POST(request: Request) {
  return workspaceOperation(
    request,
    'enterprise.subscription.configure',
    async (identity, id) => {
      const input = schema.parse(await request.json());
      return {
        subscription: await createOperationRecord(
          identity,
          {
            projectId: input.projectId,
            category: 'enterprise',
            kind: 'subscription-policy',
            title: `${input.plan} subscription`,
            status: 'active',
            ownerId: input.billingOwner,
            payload: input,
          },
          id
        ),
      };
    },
    ['admin']
  );
}
