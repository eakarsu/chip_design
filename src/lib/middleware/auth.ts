/**
 * API-route auth guard.
 *
 * The root `middleware.ts` excludes `/api/*` from the page-level auth gate
 * because API routes need to return JSON errors rather than redirect to
 * `/login`. This helper provides the JSON-returning equivalent: it reads
 * the `auth-token` cookie, validates the session + expiry, loads the
 * user, and returns either a tuple `{ user, session }` or a 401/403
 * NextResponse the caller can return directly.
 *
 * Usage:
 *
 *   export async function GET(req: NextRequest) {
 *     const guard = await requireAuth(req);
 *     if (guard instanceof NextResponse) return guard;
 *     // guard.user / guard.session are safe to use here
 *   }
 */

import { NextRequest, NextResponse } from 'next/server';
import { sessions, users } from '@/lib/db';

type UserRow = ReturnType<typeof users.getById>;
type SessionRow = ReturnType<typeof sessions.getByToken>;

export interface AuthContext {
  user: NonNullable<UserRow>;
  session: NonNullable<SessionRow>;
}

function extractToken(request: NextRequest | Request): string | null {
  // NextRequest has .cookies; plain Request doesn't. Fall back to the raw
  // Cookie header so this helper works from both API routes and edge
  // runtimes, and matches how /api/auth/me parses its token today.
  if ('cookies' in request && typeof (request as NextRequest).cookies?.get === 'function') {
    const v = (request as NextRequest).cookies.get('auth-token')?.value;
    if (v) return v;
  }
  const header = request.headers.get('cookie') || '';
  const match = header.match(/auth-token=([^;]+)/);
  return match?.[1] ?? null;
}

function unauthorized(msg = 'Authentication required'): NextResponse {
  return NextResponse.json({ error: 'Unauthorized', message: msg }, { status: 401 });
}

function forbidden(msg = 'Insufficient permissions'): NextResponse {
  return NextResponse.json({ error: 'Forbidden', message: msg }, { status: 403 });
}

export async function requireAuth(request: NextRequest | Request): Promise<AuthContext | NextResponse> {
  const token = extractToken(request);
  if (!token) return unauthorized('No auth token provided');

  const session = sessions.getByToken(token);
  if (!session || !session.active) return unauthorized('Invalid or revoked session');
  if (new Date(session.expiresAt) < new Date()) return unauthorized('Session expired');

  const user = users.getById(session.userId);
  if (!user) return unauthorized('Session user no longer exists');

  return { user, session };
}

export async function requireAdmin(request: NextRequest | Request): Promise<AuthContext | NextResponse> {
  const guard = await requireAuth(request);
  if (guard instanceof NextResponse) return guard;
  if (guard.user.role !== 'admin') return forbidden('Admin role required');
  return guard;
}
