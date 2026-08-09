import 'server-only';

import type { EdaIdentity } from '@/lib/eda/identity';
import { createOperationRecord, listOperationRecords } from './store';

export async function queueNotificationDeliveries(
  identity: EdaIdentity,
  event: {
    projectId?: string;
    trigger: string;
    severity: string;
    title: string;
    resourceId?: string;
    details?: Record<string, unknown>;
  },
  requestId: string
) {
  const rules = (await listOperationRecords(identity, { projectId: event.projectId })).filter(
    (record) =>
      record.category === 'notification' &&
      record.kind === 'escalation-rule' &&
      record.status === 'active' &&
      record.payload.trigger === event.trigger
  );
  return Promise.all(
    rules.map((rule) =>
      createOperationRecord(
        identity,
        {
          projectId: event.projectId,
          category: 'notification',
          kind: 'delivery',
          title: event.title,
          status: 'queued',
          ownerId: rule.ownerId,
          parentId: rule.id,
          payload: {
            trigger: event.trigger,
            severity: event.severity,
            channel: rule.payload.channel,
            target: rule.payload.target,
            resourceId: event.resourceId,
            details: event.details,
          },
          evidence: event.resourceId ? [event.resourceId] : [],
        },
        requestId
      )
    )
  );
}
