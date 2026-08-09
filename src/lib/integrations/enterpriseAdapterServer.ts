import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'http';
import { randomUUID, timingSafeEqual } from 'crypto';
import {
  ENTERPRISE_ADAPTER_ACTIONS,
  EnterpriseAdapterError,
  executeEnterpriseAdapterAction,
  type EnterpriseAdapterOptions,
} from './enterpriseAdapter';

const MAX_REQUEST_BYTES = 256 * 1024;
type Environment = Record<string, string | undefined>;

export interface EnterpriseAdapterServerOptions extends EnterpriseAdapterOptions {
  environment?: Environment;
  execute?: typeof executeEnterpriseAdapterAction;
}

function responseHeaders(requestId: string): Record<string, string> {
  return {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Request-Id': requestId,
  };
}

function send(response: ServerResponse, status: number, body: Record<string, unknown>, requestId: string): void {
  response.writeHead(status, responseHeaders(requestId));
  response.end(JSON.stringify({ ...body, requestId }));
}

function bearerToken(request: IncomingMessage): string {
  const authorization = request.headers.authorization ?? '';
  return authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
}

function tokenMatches(provided: string, expected: string): boolean {
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  return providedBuffer.length === expectedBuffer.length && timingSafeEqual(providedBuffer, expectedBuffer);
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const declaredLength = Number(request.headers['content-length'] ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    throw new EnterpriseAdapterError('Request body exceeds 256 KiB', 413, 'request-too-large');
  }
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += buffer.length;
    if (length > MAX_REQUEST_BYTES) {
      throw new EnterpriseAdapterError('Request body exceeds 256 KiB', 413, 'request-too-large');
    }
    chunks.push(buffer);
  }
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
    return parsed as Record<string, unknown>;
  } catch {
    throw new EnterpriseAdapterError('Request body must be a JSON object', 400, 'invalid-json');
  }
}

export function createEnterpriseAdapterServer(options: EnterpriseAdapterServerOptions = {}): Server {
  const environment = options.environment ?? process.env;
  const expectedToken = environment.CHIP_ENTERPRISE_ADAPTER_TOKEN?.trim();
  if (!expectedToken || expectedToken.length < 32) {
    throw new Error('CHIP_ENTERPRISE_ADAPTER_TOKEN must contain at least 32 characters');
  }
  const execute = options.execute ?? executeEnterpriseAdapterAction;

  return createServer(async (request, response) => {
    const requestId = randomUUID();
    const url = new URL(request.url ?? '/', 'http://adapter.internal');
    if (request.method === 'GET' && url.pathname === '/health') {
      send(response, 200, {
        status: 'ok',
        service: 'neuralchip-enterprise-adapter',
        actions: ENTERPRISE_ADAPTER_ACTIONS,
      }, requestId);
      return;
    }
    if (request.method !== 'POST' || url.pathname !== '/v1/capabilities') {
      send(response, 404, { status: 'error', code: 'not-found' }, requestId);
      return;
    }
    if (!tokenMatches(bearerToken(request), expectedToken)) {
      send(response, 401, { status: 'error', code: 'unauthorized' }, requestId);
      return;
    }

    try {
      const body = await readJson(request);
      const action = typeof body.action === 'string' ? body.action : '';
      const result = await execute(action, body.payload, {
        environment,
        fetchImpl: options.fetchImpl,
        kmsClientFactory: options.kmsClientFactory,
      });
      send(response, 200, result as unknown as Record<string, unknown>, requestId);
    } catch (error) {
      if (error instanceof EnterpriseAdapterError) {
        send(response, error.status, {
          status: 'error',
          code: error.code,
          message: error.message,
          ...error.details,
        }, requestId);
        return;
      }
      console.error(`[${requestId}] Unexpected enterprise adapter failure`, error);
      send(response, 500, { status: 'error', code: 'internal-error', message: 'Unexpected adapter failure' }, requestId);
    }
  });
}
