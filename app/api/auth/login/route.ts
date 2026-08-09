import { NextResponse } from 'next/server';
import { z } from 'zod';
import { users, sessions, auditLogs } from '@/lib/db';
import { verifyPassword, generateToken } from '@/lib/auth/password';
import { handleApiError } from '@/lib/middleware/errorHandler';
import { authCookieOptions } from '@/lib/auth/cookies';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function publicRequestUrl(pathname: string, request: Request): URL {
  const internalUrl = new URL(request.url);
  const forwardedProto = request.headers.get('x-forwarded-proto')
    ?.split(',')[0]
    ?.trim();
  const forwardedHost = request.headers.get('x-forwarded-host')
    ?.split(',')[0]
    ?.trim();
  const host = forwardedHost || request.headers.get('host') || internalUrl.host;
  const protocol = forwardedProto || internalUrl.protocol.replace(':', '');

  return new URL(pathname, `${protocol}://${host}`);
}

export async function POST(request: Request) {
  const contentType = request.headers.get('content-type') || '';
  const browserForm = contentType.includes('application/x-www-form-urlencoded')
    || contentType.includes('multipart/form-data');

  try {
    const body = browserForm
      ? Object.fromEntries((await request.formData()).entries())
      : await request.json();
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

    const requestedRedirect = new URL(request.url).searchParams.get('redirect') || '/dashboard';
    const safeRedirect = requestedRedirect.startsWith('/') && !requestedRedirect.startsWith('//')
      ? requestedRedirect
      : '/dashboard';
    const response = browserForm
      ? NextResponse.redirect(publicRequestUrl(safeRedirect, request), 303)
      : NextResponse.json({
          user: { id: user.id, email: user.email, name: user.name, role: user.role, emailVerified: user.emailVerified, avatar: user.avatar },
          token,
        });

    // Set auth cookie
    response.cookies.set(
      'auth-token',
      token,
      authCookieOptions(request, 7 * 24 * 60 * 60),
    );

    return response;
  } catch (error) {
    if (browserForm) {
      const loginUrl = publicRequestUrl('/login', request);
      const requestedRedirect = new URL(request.url).searchParams.get('redirect');
      if (requestedRedirect?.startsWith('/') && !requestedRedirect.startsWith('//')) {
        loginUrl.searchParams.set('redirect', requestedRedirect);
      }
      loginUrl.searchParams.set('error', 'Invalid email or password');
      return NextResponse.redirect(loginUrl, 303);
    }
    return handleApiError(error);
  }
}
