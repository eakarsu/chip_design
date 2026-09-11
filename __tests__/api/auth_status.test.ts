/** @jest-environment node */

process.env.CHIP_DB_PATH = ':memory:';

import { NextResponse } from 'next/server';
import { requireAdmin, requireAuth } from '@/lib/middleware/auth';
import { sessions, users } from '@/lib/db';
import type { UserRole, UserStatus } from '@/lib/db/types';
import { resetDbForTests } from '@/lib/db/connection';
import { hashPassword } from '@/lib/auth/password';

beforeEach(() => {
  resetDbForTests();
});

function seedUser(id: string, role: UserRole, status: UserStatus): void {
  const now = new Date().toISOString();
  users.create({
    id,
    tenantId: 'auth-test',
    email: `${id}@example.test`,
    name: id,
    passwordHash: hashPassword('Password1!'),
    role,
    status,
    emailVerified: true,
    createdAt: now,
    updatedAt: now,
  });
}

function seedSession(id: string, userId: string, token: string): void {
  sessions.create({
    id,
    userId,
    token,
    userAgent: 'jest',
    ipAddress: '127.0.0.1',
    browser: 'node',
    os: 'test',
    active: true,
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    createdAt: new Date().toISOString(),
  });
}

function request(token?: string): Request {
  return new Request('http://localhost/api/auth-status', {
    headers: token ? { cookie: `auth-token=${token}` } : undefined,
  });
}

describe('requireAuth account status', () => {
  it('allows an active user', async () => {
    seedUser('usr_active', 'editor', 'active');
    seedSession('sess_active', 'usr_active', 'active-token');

    const guard = await requireAuth(request('active-token'));
    expect(guard).not.toBeInstanceOf(NextResponse);
    expect(guard).toMatchObject({ user: { id: 'usr_active', status: 'active' } });
  });

  it('rejects a suspended user with 403', async () => {
    seedUser('usr_suspended', 'viewer', 'suspended');
    seedSession('sess_suspended', 'usr_suspended', 'suspended-token');

    const guard = await requireAuth(request('suspended-token'));
    expect(guard).toBeInstanceOf(NextResponse);
    const response = guard as NextResponse;
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: 'Forbidden',
      message: 'Account is not active',
    });
  });

  it('rejects a missing cookie with 401', async () => {
    const guard = await requireAuth(request());
    expect(guard).toBeInstanceOf(NextResponse);
    expect((guard as NextResponse).status).toBe(401);
  });
});

describe('requireAdmin role enforcement', () => {
  it('rejects an editor and admits an admin', async () => {
    seedUser('usr_editor', 'editor', 'active');
    seedSession('sess_editor', 'usr_editor', 'editor-token');
    seedUser('usr_admin', 'admin', 'active');
    seedSession('sess_admin', 'usr_admin', 'admin-token');

    const editor = await requireAdmin(request('editor-token'));
    expect(editor).toBeInstanceOf(NextResponse);
    expect((editor as NextResponse).status).toBe(403);

    const admin = await requireAdmin(request('admin-token'));
    expect(admin).not.toBeInstanceOf(NextResponse);
    expect(admin).toMatchObject({ user: { id: 'usr_admin', role: 'admin' } });
  });
});
