/** @jest-environment node */
import { generateKeyPairSync } from 'crypto';
import { issueEdaToken } from '@/lib/eda/token';
import { verifyOidcToken } from '@/lib/eda/identity';

describe('first-party session to EDA token exchange', () => {
  const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const privatePem = keys.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const publicPem = keys.publicKey.export({ type: 'spki', format: 'pem' }).toString();

  beforeAll(() => {
    process.env.CHIP_OIDC_ISSUER = 'https://chip.example.test';
    process.env.CHIP_OIDC_AUDIENCE = 'chip-eda-api';
    process.env.CHIP_OIDC_INTERNAL_KEY_ID = 'browser-exchange-2026';
    process.env.CHIP_OIDC_INTERNAL_PRIVATE_KEY_BASE64 = Buffer.from(privatePem).toString('base64');
    process.env.CHIP_OIDC_PUBLIC_KEYS_JSON = JSON.stringify({
      'browser-exchange-2026': Buffer.from(publicPem).toString('base64'),
    });
  });

  it('issues a short-lived, tenant- and audience-bound RS256 token', () => {
    const issued = issueEdaToken({
      tenantId: 'tenant-a', userId: 'user-a', role: 'editor', email: 'engineer@example.test',
    }, 1_900_000_000);
    expect(verifyOidcToken(issued.token, 1_900_000_001)).toEqual({
      tenantId: 'tenant-a', userId: 'user-a', role: 'editor', email: 'engineer@example.test',
    });
    expect(new Date(issued.expiresAt).getTime()).toBeLessThanOrEqual((1_900_000_000 + 900) * 1000);
  });
});
