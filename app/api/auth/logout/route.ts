import { NextResponse } from 'next/server';
import { sessions, auditLogs, users } from '@/lib/db';
import { handleApiError } from '@/lib/middleware/errorHandler';
import { authCookieOptions } from '@/lib/auth/cookies';

export async function POST(request: Request) {
  try {
    const token = request.headers.get('cookie')?.match(/auth-token=([^;]+)/)?.[1];

    if (token) {
      const session = sessions.getByToken(token);
      if (session) {
        sessions.update(session.id, { active: false });

        const user = users.getById(session.userId);
        auditLogs.create({
          id: `aud_${Date.now()}`,
          userId: session.userId,
          userName: user?.name || 'Unknown',
          action: 'logout',
          resource: 'session',
          resourceId: session.id,
          details: 'User logged out',
          ipAddress: session.ipAddress,
          createdAt: new Date().toISOString(),
        });
      }
    }

    const response = NextResponse.json({ message: 'Logged out successfully' });
    response.cookies.set('auth-token', '', authCookieOptions(request, 0));

    return response;
  } catch (error) {
    return handleApiError(error);
  }
}
