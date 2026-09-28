import { NextResponse } from 'next/server';
import type { ZodError } from 'zod';

/**
 * Shared request helpers for the /api/ai-systems/* routes.
 *
 * All five routes are plain compute endpoints: parse JSON, validate with zod,
 * run a deterministic analytical model, return the model output. Validation
 * failures return a readable 422 with a per-field issue list.
 */

export function validationFailure(error: ZodError) {
  return NextResponse.json(
    {
      error: 'Invalid request',
      message: 'Request validation failed',
      issues: error.issues.map((issue) => ({
        path: issue.path.join('.') || '(root)',
        message: issue.message,
      })),
    },
    { status: 422 }
  );
}

export async function readJsonBody(
  request: Request
): Promise<{ ok: true; body: unknown } | { ok: false; response: NextResponse }> {
  try {
    return { ok: true, body: await request.json() };
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }),
    };
  }
}

export function modelFailure(model: string, error: unknown) {
  return NextResponse.json(
    {
      error: `${model} model failed`,
      message: error instanceof Error ? error.message : String(error),
    },
    { status: 422 }
  );
}
