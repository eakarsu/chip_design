import { z } from 'zod';
import { workspaceOperation } from '@/lib/commercial/http';
import { queueNotificationDeliveries } from '@/lib/operations/notifications';

const schema = z.object({
  projectId: z.string().uuid().optional(),
  trigger: z.string().trim().min(2).max(100),
  severity: z.enum(['info', 'warning', 'high', 'critical']),
  title: z.string().trim().min(3).max(200),
  resourceId: z.string().trim().max(500).optional(),
  details: z.record(z.unknown()).optional(),
});

export async function POST(request: Request) {
  return workspaceOperation(
    request,
    'operations.notifications.dispatch',
    async (identity, id) => {
      const event = schema.parse(await request.json());
      const deliveries = await queueNotificationDeliveries(identity, event, id);
      return { queued: deliveries.length, deliveries };
    },
    ['admin', 'editor']
  );
}
