import { NextResponse } from 'next/server';
import { sessions, users } from '@/lib/db';
import { commercialDemoAccessEnabled, unquoteEnvironmentValue } from '@/lib/auth/demo';

function anonymous(reason: string) {
  // Do not clear the cookie from this read-only session check. A request that
  // started with an expired token can finish after a concurrent login and its
  // deletion response would then erase the newly issued session cookie.
  return NextResponse.json(
    { user: null, authenticated: false, reason },
    { headers: { 'Cache-Control': 'no-store, private' } },
  );
}

export async function GET(request: Request) {
  try {
    const cookieHeader = request.headers.get('cookie') || '';
    const tokenMatch = cookieHeader.match(/auth-token=([^;]+)/);
    const token = tokenMatch?.[1];

    if (!token) {
      if (commercialDemoAccessEnabled()) {
        const email = unquoteEnvironmentValue(process.env.DEMO_EMAIL || process.env.ADMIN_EMAIL);
        const user = email ? users.getByEmail(email) : null;
        if (user?.status === 'active') {
          return NextResponse.json({
            authenticated: true,
            demoAccess: true,
            user: {
              id: user.id,
              email: user.email,
              name: user.name,
              role: user.role,
              emailVerified: user.emailVerified,
              avatar: user.avatar,
            },
          }, { headers: { 'Cache-Control': 'no-store, private' } });
        }
      }
      return anonymous('Not authenticated');
    }

    const session = sessions.getByToken(token);
    if (!session || !session.active || new Date(session.expiresAt) < new Date()) {
      return anonymous('Session expired');
    }

    const user = users.getById(session.userId);
    if (!user) {
      return anonymous('Session user not found');
    }

    return NextResponse.json({
      authenticated: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        emailVerified: user.emailVerified,
        avatar: user.avatar,
      },
    });
  } catch {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
