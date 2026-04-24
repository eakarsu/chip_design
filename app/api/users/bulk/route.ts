import { NextResponse } from 'next/server';
import { z } from 'zod';
import { users, auditLogs } from '@/lib/db';
import { handleApiError } from '@/lib/middleware/errorHandler';

const bulkDeleteSchema = z.object({
  action: z.literal('delete'),
  ids: z.array(z.string()).min(1).max(100),
});

const bulkUpdateSchema = z.object({
  action: z.literal('update'),
  ids: z.array(z.string()).min(1).max(100),
  updates: z.object({
    role: z.enum(['admin', 'editor', 'viewer']).optional(),
    status: z.enum(['active', 'inactive', 'suspended']).optional(),
  }),
});

const bulkSchema = z.union([bulkDeleteSchema, bulkUpdateSchema]);

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const data = bulkSchema.parse(body);
    const now = new Date().toISOString();

    if (data.action === 'delete') {
      let deleted = 0;
      data.ids.forEach(id => {
        if (users.delete(id)) deleted++;
      });

      auditLogs.create({
        id: `aud_${Date.now()}`,
        userId: 'system',
        userName: 'System',
        action: 'bulk_delete',
        resource: 'user',
        details: `Bulk deleted ${deleted} users`,
        ipAddress: '127.0.0.1',
        createdAt: now,
      });

      return NextResponse.json({ message: `${deleted} users deleted`, deleted });
    }

    if (data.action === 'update') {
      let updated = 0;
      data.ids.forEach(id => {
        if (users.update(id, data.updates)) updated++;
      });

      auditLogs.create({
        id: `aud_${Date.now()}`,
        userId: 'system',
        userName: 'System',
        action: 'bulk_update',
        resource: 'user',
        details: `Bulk updated ${updated} users: ${JSON.stringify(data.updates)}`,
        ipAddress: '127.0.0.1',
        createdAt: now,
      });

      return NextResponse.json({ message: `${updated} users updated`, updated });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    return handleApiError(error);
  }
}
