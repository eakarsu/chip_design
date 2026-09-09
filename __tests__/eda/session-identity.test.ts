/** @jest-environment node */
import { NextResponse } from 'next/server';
import { getRawDb } from '@/lib/db/connection';
import { ensureCommercialSchema } from '@/lib/commercial/database';
import { requireEdaIdentity } from '@/lib/eda/identity';
import { GET as bootstrap } from '../../app/api/workspace/bootstrap/route';

process.env.CHIP_DB_PATH = ':memory:';
const environment = process.env as Record<string, string | undefined>;
const saved = {
  node: environment.NODE_ENV,
  demo: environment.ALLOW_DEMO_SEED,
  commercialDemo: environment.CHIP_ALLOW_COMMERCIAL_DEMO_SEED,
};

beforeAll(async () => {
  const db = getRawDb();
  const now = new Date().toISOString();
  db.prepare(
    'INSERT INTO users (id, tenant_id, email, name, password_hash, role, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    'session-user',
    'session-tenant',
    'session@example.test',
    'Session user',
    'unused-test-hash',
    'editor',
    'active',
    now,
    now
  );
  for (const [token, active, expiry] of [
    ['valid', 1, '2099-01-01T00:00:00.000Z'],
    ['revoked', 0, '2099-01-01T00:00:00.000Z'],
    ['expired', 1, '2000-01-01T00:00:00.000Z'],
  ] as const) {
    db.prepare(
      'INSERT INTO sessions (id, user_id, token, user_agent, ip_address, browser, os, active, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(token, 'session-user', token, 'test', '127.0.0.1', 'test', 'test', active, expiry, now);
  }
  await ensureCommercialSchema();
  environment.NODE_ENV = 'production';
  environment.ALLOW_DEMO_SEED = 'false';
  environment.CHIP_ALLOW_COMMERCIAL_DEMO_SEED = 'false';
});
afterAll(() => {
  for (const [name, value] of [
    ['NODE_ENV', saved.node],
    ['ALLOW_DEMO_SEED', saved.demo],
    ['CHIP_ALLOW_COMMERCIAL_DEMO_SEED', saved.commercialDemo],
  ]) {
    if (value === undefined) delete environment[name!];
    else environment[name!] = value;
  }
});

function request(pathname: string, token = 'valid', headers: Record<string, string> = {}, method = 'GET') {
  return new Request(`https://chip.example.test${pathname}`, {
    method,
    headers: { Cookie: `auth-token=${token}`, ...headers },
  });
}

it.each([
  '/api/workspace/bootstrap',
  '/api/capabilities/execute',
  '/api/academy/progress',
  '/api/workspace/artifacts/report-id',
])('accepts a validated production browser session for %s', async (pathname) => {
  expect(await requireEdaIdentity(request(pathname))).toMatchObject({
    tenantId: 'session-tenant',
    userId: 'session-user',
    role: 'editor',
  });
});

it('loads the actual production workspace bootstrap through its cookie-authenticated route', async () => {
  const response = await bootstrap(request('/api/workspace/bootstrap'));
  expect(response.status).toBe(200);
  expect((await response.json()).workspace.projects).toEqual([]);
});

it('accepts the public Host behind an internal Next listener and rejects forged forwarded hosts', async () => {
  const headers = { Cookie: 'auth-token=valid', Host: 'chip.example.test', Origin: 'https://chip.example.test', 'X-Forwarded-Proto': 'https' };
  expect(await requireEdaIdentity(new Request('http://localhost:3000/api/journey/projects', { method: 'POST', headers }))).toMatchObject({ userId: 'session-user' });
  const forged = await requireEdaIdentity(new Request('http://localhost:3000/api/journey/projects', { method: 'POST', headers: { ...headers, Origin: 'https://attacker.example.test', 'X-Forwarded-Host': 'attacker.example.test' } }));
  expect((forged as NextResponse).status).toBe(403);
  const crossSite = await requireEdaIdentity(new Request('http://localhost:3000/api/journey/projects', { method: 'POST', headers: { ...headers, 'Sec-Fetch-Site': 'cross-site' } }));
  expect((crossSite as NextResponse).status).toBe(403);
});

it('does not grant public demo access to project sources or execution evidence', async () => {
  environment.ALLOW_DEMO_SEED = 'true'; environment.CHIP_ALLOW_COMMERCIAL_DEMO_SEED = 'true';
  try {
    const response = await requireEdaIdentity(new Request('https://chip.example.test/api/journey/projects'));
    expect((response as NextResponse).status).toBe(401);
  } finally { environment.ALLOW_DEMO_SEED = 'false'; environment.CHIP_ALLOW_COMMERCIAL_DEMO_SEED = 'false'; }
});

it.each(['absent', 'expired', 'revoked'])('rejects %s sessions', async (token) => {
  const response = await requireEdaIdentity(request('/api/workspace/bootstrap', token));
  expect(response).toBeInstanceOf(NextResponse);
  expect((response as NextResponse).status).toBe(401);
});

it('rejects disabled members, cross-origin mutations, and invalid explicit tokens even with a valid cookie', async () => {
  getRawDb().prepare("UPDATE users SET status = 'suspended' WHERE id = 'session-user'").run();
  expect(((await requireEdaIdentity(request('/api/workspace/bootstrap'))) as NextResponse).status).toBe(403);
  getRawDb().prepare("UPDATE users SET status = 'active' WHERE id = 'session-user'").run();
  expect(
    (
      (await requireEdaIdentity(
        request('/api/workspace/projects', 'valid', { Origin: 'https://attacker.example.test' }, 'POST')
      )) as NextResponse
    ).status
  ).toBe(403);
  expect(
    (
      (await requireEdaIdentity(
        request('/api/workspace/projects', 'valid', { 'Sec-Fetch-Site': 'cross-site' }, 'POST')
      )) as NextResponse
    ).status
  ).toBe(403);
  expect(
    await requireEdaIdentity(
      request('/api/workspace/projects', 'valid', { Origin: 'https://chip.example.test' }, 'POST')
    )
  ).toMatchObject({ userId: 'session-user' });
  expect(
    (
      (await requireEdaIdentity(
        request('/api/workspace/bootstrap', 'valid', { Authorization: 'Bearer invalid' })
      )) as NextResponse
    ).status
  ).toBe(401);
});
