export const runtime = 'nodejs';
import { workspaceOperation } from '@/lib/commercial/http';
import { runAiReview } from '@/lib/analog/review';
import { recordRun } from '@/lib/analog/store';

export async function POST(request: Request) {
  return workspaceOperation(
    request,
    'analog.review',
    async (identity, requestId) => {
      const body = await request.json();
      const result = await runAiReview(body);
      recordRun({
        projectId: typeof body.projectId === 'string' ? body.projectId : undefined,
        kind: 'review',
        model: result.model,
        costUsd: result.usage?.costUsd,
        summary: { findings: result.findings.length, requestId },
        tenantId: identity.tenantId,
      });
      return result;
    },
    ['admin', 'editor'],
  );
}
