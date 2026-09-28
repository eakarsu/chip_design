/**
 * Shared request handling for the HLS API routes.
 *
 * Every route validates its body with zod and answers with a readable 422 on
 * invalid input. Domain errors from the parser/estimator/scaffold generator are
 * reported as 422 as well; unexpected internal failures are reported as 500.
 */

import { NextResponse } from 'next/server';
import { ZodError, type ZodType } from 'zod';
import { KernelParseError } from './kernel';

export function zodMessage(error: ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.length > 0 ? issue.path.join('.') : 'body'}: ${issue.message}`)
    .join('; ');
}

export function invalidJsonResponse(): NextResponse {
  return NextResponse.json(
    { error: 'Invalid request', message: 'Request body must be valid JSON.' },
    { status: 422 },
  );
}

export function invalidBodyResponse(error: ZodError): NextResponse {
  return NextResponse.json(
    {
      error: 'Invalid request',
      message: `Invalid request body: ${zodMessage(error)}`,
      details: error.flatten(),
    },
    { status: 422 },
  );
}

/** Map a thrown domain error to a readable response. Everything is reported honestly. */
export function hlsFailure(error: unknown): NextResponse {
  if (error instanceof KernelParseError) {
    return NextResponse.json(
      {
        error: 'Kernel parse failed',
        message: error.message,
        errors: [error.toJSON()],
        note: 'the parser stopped at the first problem; fix it and resubmit',
      },
      { status: 422 },
    );
  }
  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: 'Invalid model response', message: `Invalid model response: ${zodMessage(error)}`, details: error.flatten() },
      { status: 422 },
    );
  }
  const message = error instanceof Error ? error.message : 'HLS operation failed';
  const expected = /not supported|unsupported|outside the restricted subset|limit|must be|invalid|unknown loopId|exceeds|empty|no operations/i.test(message);
  return NextResponse.json(
    { error: expected ? 'HLS request rejected' : 'HLS operation failed', message },
    { status: expected ? 422 : 500 },
  );
}

/** Run a zod-validated plain POST handler. */
export async function hlsPost<T>(
  request: Request,
  schema: ZodType<T>,
  run: (input: T) => unknown | Promise<unknown>,
): Promise<NextResponse> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return invalidJsonResponse();
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return invalidBodyResponse(parsed.error);
  try {
    return NextResponse.json(await run(parsed.data));
  } catch (error) {
    return hlsFailure(error);
  }
}

/** Serialize a kernel IR for API responses without losing the honesty labels. */
export function kernelSummary(kernel: {
  name: string;
  source: { hash: string; lines: number; characters: number };
  parameters: unknown[];
  arrays: unknown[];
  loops: unknown[];
  ops: unknown[];
  scalars: unknown[];
  opMix: unknown;
  maxLoopDepth: number;
}): Record<string, unknown> {
  return {
    name: kernel.name,
    source: kernel.source,
    parameters: kernel.parameters,
    arrays: kernel.arrays,
    loops: kernel.loops,
    operations: kernel.ops,
    scalars: kernel.scalars,
    opMix: kernel.opMix,
    maxLoopDepth: kernel.maxLoopDepth,
  };
}
