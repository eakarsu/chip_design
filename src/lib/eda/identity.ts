import { createPublicKey, verify } from 'crypto';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/middleware/auth';
import { commercialDemoApiAllowed, unquoteEnvironmentValue } from '@/lib/auth/demo';

export type EdaRole = 'admin' | 'editor' | 'viewer';

export interface EdaIdentity {
  tenantId: string;
  userId: string;
  role: EdaRole;
  email?: string;
}

type JwtPayload = {
  iss?: string;
  aud?: string | string[];
  sub?: string;
  exp?: number;
  nbf?: number;
  tenant_id?: string;
  org_id?: string;
  role?: string;
  email?: string;
};

function unauthorized(message: string, status = 401): NextResponse {
  return NextResponse.json({ error: 'Unauthorized', message }, { status });
}

function decodeJson<T>(part: string): T {
  if (part.length > 16_384) throw new Error('token segment is too large');
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as T;
}

function configuredKeys(): Record<string, string> {
  const raw = process.env.CHIP_OIDC_PUBLIC_KEYS_JSON;
  if (!raw) throw new Error('CHIP_OIDC_PUBLIC_KEYS_JSON is required');
  const encoded = JSON.parse(raw) as Record<string, unknown>;
  const keys: Record<string, string> = {};
  for (const [kid, value] of Object.entries(encoded)) {
    if (typeof value !== 'string' || !kid) throw new Error('invalid OIDC key ring');
    keys[kid] = Buffer.from(value, 'base64').toString('utf8');
  }
  return keys;
}

export function verifyOidcToken(token: string, nowSeconds = Math.floor(Date.now() / 1000)): EdaIdentity {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('malformed token');
  const header = decodeJson<{ alg?: string; kid?: string }>(parts[0]);
  const payload = decodeJson<JwtPayload>(parts[1]);
  if (header.alg !== 'RS256' || !header.kid) throw new Error('RS256 token with kid is required');
  const pem = configuredKeys()[header.kid];
  if (!pem) throw new Error('unknown signing key');
  const validSignature = verify(
    'RSA-SHA256',
    Buffer.from(`${parts[0]}.${parts[1]}`),
    createPublicKey(pem),
    Buffer.from(parts[2], 'base64url'),
  );
  if (!validSignature) throw new Error('invalid signature');

  const issuer = process.env.CHIP_OIDC_ISSUER;
  const audience = process.env.CHIP_OIDC_AUDIENCE;
  if (!issuer || !audience) throw new Error('OIDC issuer and audience are required');
  if (payload.iss !== issuer) throw new Error('invalid issuer');
  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!audiences.includes(audience)) throw new Error('invalid audience');
  if (!payload.exp || payload.exp <= nowSeconds - 30) throw new Error('expired token');
  if (payload.nbf && payload.nbf > nowSeconds + 30) throw new Error('token is not active');
  const tenantId = payload.tenant_id ?? payload.org_id;
  if (!payload.sub || !tenantId) throw new Error('subject and tenant claims are required');
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(tenantId) || !/^[a-zA-Z0-9@._:-]{1,160}$/.test(payload.sub)) {
    throw new Error('invalid subject or tenant identifier');
  }
  if (!['admin', 'editor', 'viewer'].includes(payload.role ?? '')) throw new Error('invalid role');
  return {
    tenantId,
    userId: payload.sub,
    role: payload.role as EdaRole,
    email: payload.email,
  };
}

export async function requireEdaIdentity(request: Request): Promise<EdaIdentity | NextResponse> {
  const authorization = request.headers.get('authorization') ?? '';
  const pathname = new URL(request.url).pathname;
  if (
    commercialDemoApiAllowed(pathname)
    && !authorization
  ) {
    return {
      tenantId: process.env.GOVERNANCE_TENANT_ID || process.env.TENANT_ID || 'runtime-tenant',
      userId: 'runtime_admin',
      role: 'admin',
      email: unquoteEnvironmentValue(process.env.DEMO_EMAIL || process.env.ADMIN_EMAIL),
    };
  }

  if (process.env.NODE_ENV === 'production' && authorization) {
    if (!authorization.startsWith('Bearer ')) return unauthorized('OIDC bearer token required');
    try {
      return verifyOidcToken(authorization.slice(7));
    } catch (error) {
      return unauthorized(error instanceof Error ? error.message : 'invalid identity');
    }
  }

  // First-party browser pages and artifact downloads carry the validated
  // HTTP-only session cookie. An explicit bearer token must never fall back
  // to that cookie when token verification fails.
  const origin = request.headers.get('origin');
  const requestUrl = new URL(request.url);
  // Next may construct request.url with its internal listener hostname. The
  // browser-facing Host is preserved by our reverse proxy; do not accept a
  // client-supplied X-Forwarded-Host as a substitute for that authority.
  const browserHost = request.headers.get('host') || requestUrl.host;
  const forwardedProtocol = request.headers.get('x-forwarded-proto');
  const protocol = forwardedProtocol === 'https' || forwardedProtocol === 'http'
    ? `${forwardedProtocol}:` : requestUrl.protocol;
  const browserOrigin = `${protocol}//${browserHost}`;
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method) &&
      (request.headers.get('sec-fetch-site') === 'cross-site' ||
       (origin && origin !== browserOrigin))) {
    return unauthorized('Cross-origin session mutation is not permitted', 403);
  }
  const local = await requireAuth(request);
  if (local instanceof NextResponse) return local;
  if (local.user.status !== 'active' || !['admin', 'editor', 'viewer'].includes(local.user.role)) {
    return unauthorized('Active workspace membership is required', 403);
  }
  const tenantId = local.user.tenantId ?? 'local';
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(tenantId)) return unauthorized('invalid local tenant identity', 403);
  return {
    tenantId,
    userId: local.user.id,
    role: local.user.role,
    email: local.user.email,
  };
}

export function requireEdaRole(identity: EdaIdentity, roles: EdaRole[]): NextResponse | null {
  return roles.includes(identity.role)
    ? null
    : NextResponse.json({ error: 'Forbidden', message: 'Insufficient EDA role' }, { status: 403 });
}
