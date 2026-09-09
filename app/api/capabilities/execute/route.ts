import { z } from 'zod';
import { PLATFORM_CAPABILITY_IDS } from '@/lib/commercial/capabilities';
import { capabilityAction } from '@/lib/commercial/capabilityActionCatalog';
import { executeCapabilityAction } from '@/lib/commercial/capabilityExecution';
import { workspaceOperation } from '@/lib/commercial/http';
import { assertWorkspaceProjectOwnership, createFeatureRecord } from '@/lib/commercial/store';

const schema = z
  .object({
    projectId: z.string().uuid(),
    capabilityId: z.enum(PLATFORM_CAPABILITY_IDS),
    actionId: z.string().trim().min(2).max(80),
    input: z.record(z.unknown()).refine((value) => JSON.stringify(value).length <= 100_000, 'Input exceeds 100 KB'),
    evidence: z.array(z.string().trim().min(1).max(500)).max(20).default([]),
  })
  .strict();

export async function POST(request: Request) {
  return workspaceOperation(
    request,
    'capability.execute',
    async (identity, requestId) => {
      const input = schema.parse(await request.json());
      const definition = capabilityAction(input.capabilityId, input.actionId);
      if (!definition) throw new Error(`Unsupported capability action: ${input.capabilityId}/${input.actionId}`);
      await assertWorkspaceProjectOwnership(identity, input.projectId);

      const execution = await executeCapabilityAction({
        identity,
        projectId: input.projectId,
        capabilityId: input.capabilityId,
        actionId: input.actionId,
        input: input.input,
      });
      const record = await createFeatureRecord(
        identity,
        {
          projectId: input.projectId,
          feature: input.capabilityId,
          recordType: input.actionId,
          title: definition.title,
          status: execution.status,
          payload: { execution, input: input.input },
          evidence: input.evidence.length ? input.evidence : [`capability-execution:${requestId}`],
        },
        requestId,
        'execution'
      );
      return { execution, record };
    },
    ['admin', 'editor']
  );
}
