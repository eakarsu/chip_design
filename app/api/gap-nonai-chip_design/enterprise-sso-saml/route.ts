import { z } from 'zod';
import { workspaceOperation } from '@/lib/commercial/http';
import { createOperationRecord } from '@/lib/operations/store';

const schema = z.object({
  organization: z.string().trim().min(2).max(200),
  protocol: z.enum(['saml', 'oidc']),
  issuer: z.string().trim().url().max(1000),
  domains: z.array(z.string().trim().min(3).max(253)).min(1).max(50),
  mfaRequired: z.boolean(),
  scimEnabled: z.boolean(),
});

export async function POST(request: Request) {
  return workspaceOperation(
    request,
    'enterprise.sso.configure',
    async (identity, id) => {
      const input = schema.parse(await request.json());
      return {
        identityProvider: await createOperationRecord(
          identity,
          {
            category: 'enterprise',
            kind: 'identity-provider',
            title: `${input.organization} · ${input.protocol.toUpperCase()}`,
            status: 'pending-verification',
            payload: input,
          },
          id
        ),
      };
    },
    ['admin']
  );
}
