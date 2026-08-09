import { z } from 'zod';
import {
  AI_DESIGN_WORKFLOW_IDS,
  aiDesignFeature,
  aiDesignStepRecordType,
  aiDesignWorkflow,
} from '@/lib/commercial/aiDesignWorkflows';
import { workspaceOperation } from '@/lib/commercial/http';
import { createFeatureRecord } from '@/lib/commercial/store';

const schema = z
  .object({
    projectId: z.string().uuid(),
    workflowId: z.enum(AI_DESIGN_WORKFLOW_IDS),
    stepId: z.string().trim().min(2).max(80),
    owner: z.string().trim().min(2).max(120),
    summary: z.string().trim().min(10).max(4_000),
    status: z.enum(['complete', 'blocked']),
    evidence: z.array(z.string().trim().min(1).max(500)).min(1).max(20),
  })
  .strict();

export async function POST(request: Request) {
  return workspaceOperation(
    request,
    'ai-design.step.record',
    async (identity, requestId) => {
      const input = schema.parse(await request.json());
      const workflow = aiDesignWorkflow(input.workflowId);
      const step = workflow?.steps.find((item) => item.id === input.stepId);
      if (!workflow || !step) throw new Error('AI design workflow step was not found');
      if (step.actions?.length || step.kind === 'ai' || step.kind === 'decision') {
        throw new Error('This AI design step must be completed through its governed tool or review action');
      }

      return {
        record: await createFeatureRecord(
          identity,
          {
            projectId: input.projectId,
            feature: aiDesignFeature(workflow.id),
            recordType: aiDesignStepRecordType(step.id),
            title: `${workflow.shortTitle} · ${step.title}`,
            status: input.status,
            payload: {
              owner: input.owner,
              summary: input.summary,
              objective: step.objective,
              aiRole: step.aiRole,
              humanRole: step.humanRole,
              acceptanceCriteria: step.acceptanceCriteria,
            },
            evidence: input.evidence,
          },
          requestId
        ),
      };
    },
    ['admin', 'editor']
  );
}
