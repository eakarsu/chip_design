import 'server-only';

import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { requireEdaIdentity, requireEdaRole, type EdaIdentity, type EdaRole } from '@/lib/eda/identity';
import { observed, requestId } from './observability';

export async function workspaceIdentity(request: Request, roles: EdaRole[] = ['admin', 'editor', 'viewer']): Promise<EdaIdentity | NextResponse> {
  const identity = await requireEdaIdentity(request);
  if (identity instanceof NextResponse) return identity;
  return requireEdaRole(identity, roles) ?? identity;
}

export async function workspaceOperation<T>(request: Request, operation: string, task: (identity: EdaIdentity, requestId: string) => Promise<T>, roles: EdaRole[] = ['admin', 'editor', 'viewer']): Promise<NextResponse> {
  const id = requestId(request);
  const identity = await workspaceIdentity(request, roles);
  if (identity instanceof NextResponse) return identity;
  try {
    const result = await observed(operation, id, () => task(identity, id));
    return NextResponse.json(result, { headers: { 'X-Request-Id': id } });
  } catch (error) {
    const validation = error instanceof ZodError;
    const message = error instanceof Error ? error.message : 'Workspace operation failed';
    const providerFailure = /OpenRouter|AI provider|AI model|structured response|output budget|rate or credit limit|timed out/i.test(message);
    const status = validation ? 400 : providerFailure ? 502 : /not found/i.test(message) ? 404 : /already|conflict/i.test(message) ? 409 : 400;
    return NextResponse.json({ error: validation ? 'Invalid request' : 'Workspace operation failed', message, details: validation ? error.flatten() : undefined }, { status, headers: { 'X-Request-Id': id } });
  }
}
