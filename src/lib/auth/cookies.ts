import type { NextRequest } from 'next/server';

type RequestLike = Request | NextRequest;

/**
 * Use secure cookies whenever the browser-facing request is HTTPS. Nginx
 * terminates TLS and supplies X-Forwarded-Proto, while local Docker testing
 * reaches Next.js directly over HTTP.
 */
export function requestUsesHttps(request: RequestLike): boolean {
  const forwardedProto = request.headers
    .get('x-forwarded-proto')
    ?.split(',')[0]
    ?.trim()
    .toLowerCase();

  if (forwardedProto) return forwardedProto === 'https';

  try {
    return new URL(request.url).protocol === 'https:';
  } catch {
    return false;
  }
}

export function authCookieOptions(request: RequestLike, maxAge: number) {
  return {
    httpOnly: true,
    secure: requestUsesHttps(request),
    sameSite: 'lax' as const,
    maxAge,
    path: '/',
  };
}
