import { NextResponse } from 'next/server';
import { z } from 'zod';
import { users, auditLogs } from '@/lib/db';
import { handleApiError } from '@/lib/middleware/errorHandler';
import { sanitizeObject } from '@/lib/middleware/sanitize';

const updateSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  email: z.string().email().optional(),
  role: z.enum(['admin', 'editor', 'viewer']).optional(),
  status: z.enum(['active', 'inactive', 'suspended']).optional(),
});

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = users.getById(id);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    const { passwordHash, ...userWithoutPassword } = user;
    return NextResponse.json(userWithoutPassword);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = sanitizeObject(await request.json());
    const data = updateSchema.parse(body);

    const updated = users.update(id, data);
    if (!updated) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    auditLogs.create({
      id: `aud_${Date.now()}`,
      userId: 'system',
      userName: 'System',
      action: 'update',
      resource: 'user',
      resourceId: id,
      details: `User updated: ${JSON.stringify(data)}`,
      ipAddress: '127.0.0.1',
      createdAt: new Date().toISOString(),
    });

    const { passwordHash, ...userWithoutPassword } = updated;
    return NextResponse.json(userWithoutPassword);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = users.getById(id);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    users.delete(id);

    auditLogs.create({
      id: `aud_${Date.now()}`,
      userId: 'system',
      userName: 'System',
      action: 'delete',
      resource: 'user',
      resourceId: id,
      details: `User deleted: ${user.email}`,
      ipAddress: '127.0.0.1',
      createdAt: new Date().toISOString(),
    });

    return NextResponse.json({ message: 'User deleted' });
  } catch (error) {
    return handleApiError(error);
  }
}
