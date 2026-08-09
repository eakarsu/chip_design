import { z } from 'zod';
import { workspaceOperation } from '@/lib/commercial/http';
import { createOperationRecord } from '@/lib/operations/store';

const schema = z.object({
  provider: z.enum(['aws-kms', 'gcp-kms', 'azure-key-vault', 'external']),
  keyRef: z.string().trim().min(8).max(1000),
  rotationDays: z.number().int().min(30).max(3650),
  status: z.enum(['pending-verification', 'active', 'rotation-due']),
  owner: z.string().trim().min(1).max(200),
});

export async function POST(request: Request) {
  return workspaceOperation(
    request,
    'enterprise.kms.configure',
    async (identity, id) => {
      const input = schema.parse(await request.json());
      return {
        key: await createOperationRecord(
          identity,
          {
            category: 'enterprise',
            kind: 'customer-managed-key',
            title: `${input.provider} managed artifact key`,
            status: input.status,
            ownerId: input.owner,
            payload: input,
          },
          id
        ),
      };
    },
    ['admin']
  );
}
