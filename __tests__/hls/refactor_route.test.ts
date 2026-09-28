/** @jest-environment node */

process.env.CHIP_DB_PATH = ':memory:';

import { sessions, users } from '@/lib/db';
import { resetDbForTests } from '@/lib/db/connection';
import { hashPassword } from '@/lib/auth/password';
import { generateJSONCompletion } from '@/lib/openrouter';
import { POST } from '../../app/api/hls/refactor/route';
import type { UserRole } from '@/lib/db/types';

jest.mock('@/lib/openrouter', () => ({ generateJSONCompletion: jest.fn() }));

const mockCompletion = generateJSONCompletion as jest.Mock;

const draft = {
  rewrittenSource: 'void fib_iter(int n, int out[1]) { out[0] = 0; for (int i = 0; i < n; i++) { out[0] += i; } }',
  testbench: 'int main(void) { return 0; }',
  rationale: 'Replaces recursion with a bounded loop so the iteration count is static.',
  caveats: ['The loop assumes n is a constant supplied by the caller.'],
};

function seedUser(id: string, role: UserRole): void {
  const now = new Date().toISOString();
  users.create({
    id,
    tenantId: 'hls-test',
    email: `${id}@example.test`,
    name: id,
    passwordHash: hashPassword('Password1!'),
    role,
    status: 'active',
    emailVerified: true,
    createdAt: now,
    updatedAt: now,
  });
  sessions.create({
    id: `sess_${id}`,
    userId: id,
    token: `token_${id}`,
    userAgent: 'jest',
    ipAddress: '127.0.0.1',
    browser: 'node',
    os: 'test',
    active: true,
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    createdAt: now,
  });
}

function request(body: unknown, token?: string): Request {
  return new Request('http://test/api/hls/refactor', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { cookie: `auth-token=${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  resetDbForTests();
  mockCompletion.mockReset();
});

describe('/api/hls/refactor governance', () => {
  it('answers 422 for an invalid body before doing any work', async () => {
    const response = await POST(request({ source: 'tiny' }));
    expect(response.status).toBe(422);
    expect((await response.json()).message).toContain('Invalid request body');
    expect(mockCompletion).not.toHaveBeenCalled();
  });

  it('requires an authenticated admin/editor workspace identity', async () => {
    const anonymous = await POST(request({ source: 'int fib(int n) { return fib(n - 1); }' }));
    expect(anonymous.status).toBe(401);
    expect((await anonymous.json()).error).toBe('Unauthorized');
    expect(mockCompletion).not.toHaveBeenCalled();

    resetDbForTests();
    seedUser('viewer_hls', 'viewer');
    const viewer = await POST(request({ source: 'int fib(int n) { return fib(n - 1); }' }, 'token_viewer_hls'));
    expect(viewer.status).toBe(403);
    expect(mockCompletion).not.toHaveBeenCalled();
  });

  it('returns a labelled LLM draft for an editor without claiming verification', async () => {
    seedUser('editor_hls', 'editor');
    mockCompletion.mockResolvedValueOnce(draft);

    const response = await POST(request({ source: 'int fib(int n) { return fib(n - 1); }', filename: 'fib.c' }, 'token_editor_hls'));
    expect(response.status).toBe(200);
    expect(response.headers.get('X-Request-Id')).toBeTruthy();

    const body = await response.json();
    expect(body.label).toBe('LLM draft — verify by compilation/synthesis before use');
    expect(body.verification.performed).toBe(false);
    expect(body.analysis.findings.some((finding: { code: string }) => finding.code === 'recursion')).toBe(true);
    expect(body.draft).toEqual(draft);
    expect(mockCompletion).toHaveBeenCalledTimes(1);
  });

  it('maps a provider failure to a 502 without ever claiming success', async () => {
    seedUser('editor_hls', 'editor');
    mockCompletion.mockRejectedValueOnce(new Error('OpenRouter request failed.'));

    const response = await POST(request({ source: 'int fib(int n) { return fib(n - 1); }' }, 'token_editor_hls'));
    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body.error).toBe('Workspace operation failed');
    expect(JSON.stringify(body)).not.toContain('LLM draft — verify');
  });
});
