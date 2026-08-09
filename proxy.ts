import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { commercialDemoPageAllowed } from '@/lib/auth/demo';

const securityHeaders = {
  'X-DNS-Prefetch-Control': 'on',
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
};

const protectedRoutes = [
  '/admin',
  '/profile',
  '/workspace',
  '/operations',
  '/academy',
  '/governed-ai/chat',
  '/governed-ai/lifecycle',
  '/batch09/cfs/continuous-ppa-tracking-across-commits',
  '/batch09/cfs/ai-agent-that-ties-rtl-change-to-downstream-pnr-impact-predi',
  '/batch09/cfs/gpu-accelerated-spice-net-regression-dashboard',
  '/batch09/cfs/live-co-design-sessions-with-cursor-share',
  '/batch09/cfs/marketplace-of-community-design-libraries',
];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const response = NextResponse.next();

  Object.entries(securityHeaders).forEach(([key, value]) => {
    response.headers.set(key, value);
  });

  const token = request.cookies.get('auth-token')?.value;
  const demoRouteAllowed = commercialDemoPageAllowed(pathname);

  if (protectedRoutes.some((route) => pathname.startsWith(route)) && !token && !demoRouteAllowed) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api).*)'],
};
