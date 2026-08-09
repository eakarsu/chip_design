import 'server-only';

import { createPrivateKey, sign } from 'crypto';
import type { EdaIdentity } from './identity';

export interface IssuedEdaToken {
  token: string;
  expiresAt: string;
}

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function signingKey(): { kid: string; pem: string } {
  const kid = process.env.CHIP_OIDC_INTERNAL_KEY_ID?.trim();
  const encoded = process.env.CHIP_OIDC_INTERNAL_PRIVATE_KEY_BASE64?.trim();
  if (!kid || !/^[A-Za-z0-9._-]{1,80}$/.test(kid)) {
    throw new Error('CHIP_OIDC_INTERNAL_KEY_ID is not configured');
  }
  if (!encoded) throw new Error('CHIP_OIDC_INTERNAL_PRIVATE_KEY_BASE64 is not configured');
  const pem = Buffer.from(encoded, 'base64').toString('utf8');
  createPrivateKey(pem);
  return { kid, pem };
}

/**
 * Exchanges an already authenticated first-party browser session for a short
 * lived, audience-bound bearer token. The private key never reaches the
 * browser and the resulting token cannot be used outside the EDA API.
 */
export function issueEdaToken(identity: EdaIdentity, nowSeconds = Math.floor(Date.now() / 1000)): IssuedEdaToken {
  const issuer = process.env.CHIP_OIDC_ISSUER?.trim();
  const audience = process.env.CHIP_OIDC_AUDIENCE?.trim();
  if (!issuer || !audience) throw new Error('OIDC issuer and audience are required');
  const { kid, pem } = signingKey();
  const lifetime = Math.max(60, Math.min(Number(process.env.CHIP_OIDC_INTERNAL_TOKEN_SECONDS ?? 600), 900));
  const expires = nowSeconds + lifetime;
  const header = encode({ alg: 'RS256', kid, typ: 'JWT' });
  const payload = encode({
    iss: issuer,
    aud: audience,
    sub: identity.userId,
    tenant_id: identity.tenantId,
    role: identity.role,
    email: identity.email,
    iat: nowSeconds,
    nbf: nowSeconds - 5,
    exp: expires,
  });
  const message = `${header}.${payload}`;
  const signature = sign('RSA-SHA256', Buffer.from(message), createPrivateKey(pem)).toString('base64url');
  return { token: `${message}.${signature}`, expiresAt: new Date(expires * 1000).toISOString() };
}
