/** @jest-environment node */

import { authCookieOptions, requestUsesHttps } from '@/lib/auth/cookies';

describe('authentication cookie transport', () => {
  it('allows the browser to retain a session during direct local HTTP testing', () => {
    const request = new Request('http://127.0.0.1:31815/api/auth/login');

    expect(requestUsesHttps(request)).toBe(false);
    expect(authCookieOptions(request, 60)).toMatchObject({
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      maxAge: 60,
      path: '/',
    });
  });

  it('keeps secure cookies enabled behind an HTTPS reverse proxy', () => {
    const request = new Request('http://127.0.0.1:3000/api/auth/login', {
      headers: { 'x-forwarded-proto': 'https' },
    });

    expect(requestUsesHttps(request)).toBe(true);
    expect(authCookieOptions(request, 60).secure).toBe(true);
  });

  it('uses the first forwarded protocol supplied by the trusted proxy chain', () => {
    const request = new Request('http://127.0.0.1:3000/api/auth/login', {
      headers: { 'x-forwarded-proto': 'https, http' },
    });

    expect(requestUsesHttps(request)).toBe(true);
  });
});
