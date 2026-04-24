import { NextResponse } from 'next/server';
import { z } from 'zod';
import { users, sessions, auditLogs } from '@/lib/db';
import { verifyPassword, generateToken } from '@/lib/auth/password';
import { handleApiError } from '@/lib/middleware/errorHandler';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const data = loginSchema.parse(body);

    const user = users.getByEmail(data.email);
    if (!user || !verifyPassword(data.password, user.passwordHash)) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    if (user.status !== 'active') {
      return NextResponse.json({ error: 'Account is not active' }, { status: 403 });
    }

    const now = new Date().toISOString();
    const token = generateToken();

    // Create session
    const session = sessions.create({
      id: `ses_${Date.now()}`,
      userId: user.id,
      token,
      userAgent: request.headers.get('user-agent') || 'Unknown',
      ipAddress: request.headers.get('x-forwarded-for') || '127.0.0.1',
      browser: 'Chrome',
      os: 'Unknown',
      active: true,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      createdAt: now,
    });

    // Update last login
    users.update(user.id, { lastLoginAt: now });

    // Audit log
    auditLogs.create({
      id: `aud_${Date.now()}`,
      userId: user.id,
      userName: user.name,
      action: 'login',
      resource: 'session',
      resourceId: session.id,
      details: `User logged in from ${session.ipAddress}`,
      ipAddress: session.ipAddress,
      createdAt: now,
    });

    const response = NextResponse.json({
      user: { id: user.id, email: user.email, name: user.name, role: user.role, emailVerified: user.emailVerified, avatar: user.avatar },
      token,
    });

    // Set auth cookie
    response.cookies.set('auth-token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60,
      path: '/',
    });

    return response;
  } catch (error) {
    return handleApiError(error);
  }
}
