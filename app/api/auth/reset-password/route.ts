import { NextResponse } from 'next/server';
import { z } from 'zod';
import { users, passwordResets, auditLogs } from '@/lib/db';
import { hashPassword, generateToken } from '@/lib/auth/password';
import { handleApiError } from '@/lib/middleware/errorHandler';

const requestSchema = z.object({ email: z.string().email() });
const resetSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8)
    .regex(/[A-Z]/).regex(/[a-z]/).regex(/[0-9]/).regex(/[^A-Za-z0-9]/),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email } = requestSchema.parse(body);
    const user = users.getByEmail(email);

    // Always return success to prevent email enumeration
    if (user) {
      const now = new Date().toISOString();
      const token = generateToken();
      passwordResets.create({
        id: `pwr_${Date.now()}`,
        userId: user.id,
        userEmail: user.email,
        token,
        status: 'pending',
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        createdAt: now,
      });
    }

    return NextResponse.json({ message: 'If the email exists, a reset link has been sent.' });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { token, newPassword } = resetSchema.parse(body);

    const reset = passwordResets.getByToken(token);
    if (!reset || reset.status !== 'pending' || new Date(reset.expiresAt) < new Date()) {
      return NextResponse.json({ error: 'Invalid or expired reset token' }, { status: 400 });
    }

    const user = users.getById(reset.userId);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const now = new Date().toISOString();
    users.update(user.id, { passwordHash: hashPassword(newPassword), updatedAt: now });
    passwordResets.update(reset.id, { status: 'used', usedAt: now });

    auditLogs.create({
      id: `aud_${Date.now()}`,
      userId: user.id,
      userName: user.name,
      action: 'password_reset',
      resource: 'user',
      resourceId: user.id,
      details: 'Password reset via token',
      ipAddress: '127.0.0.1',
      createdAt: now,
    });

    return NextResponse.json({ message: 'Password reset successfully' });
  } catch (error) {
    return handleApiError(error);
  }
}
