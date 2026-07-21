/** @jest-environment node */
import { generateKeyPairSync, sign } from 'crypto';
import { verifyOidcToken } from '@/lib/eda/identity';

function encoded(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

describe('production OIDC identity boundary', () => {
  const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const publicPem = keys.publicKey.export({ type: 'spki', format: 'pem' }).toString();

  beforeAll(() => {
    process.env.CHIP_OIDC_ISSUER = 'https://identity.example.test';
    process.env.CHIP_OIDC_AUDIENCE = 'chip-design';
    process.env.CHIP_OIDC_PUBLIC_KEYS_JSON = JSON.stringify({
      current: Buffer.from(publicPem).toString('base64'),
    });
  });

  function token(overrides: Record<string, unknown> = {}): string {
    const header = encoded({ alg: 'RS256', kid: 'current', typ: 'JWT' });
    const payload = encoded({
      iss: process.env.CHIP_OIDC_ISSUER, aud: process.env.CHIP_OIDC_AUDIENCE,
      sub: 'user-1', tenant_id: 'tenant-1', role: 'editor', exp: 2_000_000_000,
      ...overrides,
    });
    const message = `${header}.${payload}`;
    return `${message}.${sign('RSA-SHA256', Buffer.from(message), keys.privateKey).toString('base64url')}`;
  }

  it('accepts a signed, tenant-bound, issuer/audience-constrained identity', () => {
    expect(verifyOidcToken(token(), 1_900_000_000)).toMatchObject({
      tenantId: 'tenant-1', userId: 'user-1', role: 'editor',
    });
  });

  it('rejects invalid audience, expiry, role, and signature', () => {
    expect(() => verifyOidcToken(token({ aud: 'other' }), 1_900_000_000)).toThrow(/audience/);
    expect(() => verifyOidcToken(token({ exp: 1 }), 1_900_000_000)).toThrow(/expired/);
    expect(() => verifyOidcToken(token({ role: 'owner' }), 1_900_000_000)).toThrow(/role/);
    const valid = token();
    const [header, payload, signature] = valid.split('.');
    const forged = encoded({
      ...JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')),
      sub: 'attacker',
    });
    expect(() => verifyOidcToken(`${header}.${forged}.${signature}`, 1_900_000_000)).toThrow(/signature/);
  });
});
