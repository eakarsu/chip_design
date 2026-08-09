import { z } from 'zod';
import { workspaceOperation } from '@/lib/commercial/http';
import { createOperationRecord } from '@/lib/operations/store';
import { createPpaSnapshot } from '@/lib/commercial/store';
import { queueNotificationDeliveries } from '@/lib/operations/notifications';

const schema = z.object({
  projectId: z.string().uuid(),
  provider: z.enum(['github', 'gitlab', 'generic']),
  repository: z.string().trim().url().max(500),
  commitSha: z.string().trim().min(7).max(64),
  branch: z.string().trim().min(1).max(200),
  pullRequest: z.string().trim().max(120).optional(),
  checkUrl: z.string().url().max(1000).optional(),
  status: z.enum(['queued', 'running', 'passed', 'failed']),
  metrics: z
    .object({
      areaUm2: z.number().nonnegative(),
      powerMw: z.number().nonnegative(),
      wnsNs: z.number(),
      tnsNs: z.number(),
      drcCount: z.number().int().nonnegative(),
      congestionPct: z.number().min(0).max(100),
    })
    .optional(),
  evidence: z.array(z.string().trim().min(1).max(1000)).max(50).default([]),
});

export async function POST(request: Request) {
  return workspaceOperation(
    request,
    'operations.ci.ingest',
    async (identity, requestId) => {
      const input = schema.parse(await request.json());
      const record = await createOperationRecord(
        identity,
        {
          projectId: input.projectId,
          category: 'integration',
          kind: 'ci-check',
          title: `${input.provider} · ${input.commitSha.slice(0, 12)}`,
          status: input.status,
          payload: {
            provider: input.provider,
            repository: input.repository,
            commitSha: input.commitSha,
            branch: input.branch,
            pullRequest: input.pullRequest,
            checkUrl: input.checkUrl,
            metrics: input.metrics,
          },
          evidence: input.evidence,
        },
        requestId
      );
      const snapshot =
        input.metrics && ['passed', 'failed'].includes(input.status)
          ? await createPpaSnapshot(
              identity,
              {
                projectId: input.projectId,
                commitSha: input.commitSha,
                branch: input.branch,
                message: input.pullRequest ? `CI check for ${input.pullRequest}` : 'CI-reported implementation result',
                author: `${input.provider} CI`,
                ...input.metrics,
                thresholds: { areaPct: 3, powerPct: 5, wnsNs: -0.03, drc: 2, congestionPct: 5 },
                evidence: input.evidence.length
                  ? input.evidence
                  : [input.checkUrl ?? `${input.provider}:${input.commitSha}`],
              },
              requestId
            )
          : undefined;
      const conclusion = snapshot?.status ?? input.status;
      const trigger =
        snapshot?.status === 'regression' ? 'ppa-regression' : input.status === 'failed' ? 'run-failed' : undefined;
      const deliveries = trigger
        ? await queueNotificationDeliveries(
            identity,
            {
              projectId: input.projectId,
              trigger,
              severity: 'high',
              title: `${input.provider} check ${conclusion}: ${input.commitSha.slice(0, 12)}`,
              resourceId: record.id,
              details: { repository: input.repository, branch: input.branch, conclusion },
            },
            requestId
          )
        : [];
      return { record, snapshot, conclusion, notificationsQueued: deliveries.length };
    },
    ['admin', 'editor']
  );
}
