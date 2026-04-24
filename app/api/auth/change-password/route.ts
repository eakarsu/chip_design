import { NextResponse } from 'next/server';
import { z } from 'zod';
import { users, sessions, auditLogs } from '@/lib/db';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { handleApiError } from '@/lib/middleware/errorHandler';

const schema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8)
    .regex(/[A-Z]/).regex(/[a-z]/).regex(/[0-9]/).regex(/[^A-Za-z0-9]/),
});

export async function PUT(request: Request) {
  try {
    const token = request.headers.get('cookie')?.match(/auth-token=([^;]+)/)?.[1];
    if (!token) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const session = sessions.getByToken(token);
    if (!session || !session.active) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    const user = users.getById(session.userId);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const body = await request.json();
    const { currentPassword, newPassword } = schema.parse(body);

    if (!verifyPassword(currentPassword, user.passwordHash)) {
      return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400 });
    }

    const now = new Date().toISOString();
    users.update(user.id, { passwordHash: hashPassword(newPassword), updatedAt: now });

    auditLogs.create({
      id: `aud_${Date.now()}`,
      userId: user.id,
      userName: user.name,
      action: 'password_change',
      resource: 'user',
      resourceId: user.id,
      details: 'Password changed by user',
      ipAddress: session.ipAddress,
      createdAt: now,
    });

    return NextResponse.json({ message: 'Password changed successfully' });
  } catch (error) {
    return handleApiError(error);
  }
}
