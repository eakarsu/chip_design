export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import { analyzeLoopNest, loopNestSchema } from '@/lib/accelerator/polyhedral';

/**
 * POST /api/accelerator/polyhedral
 *
 * Body: affine loop nest (loop bounds + body array accesses + memory model).
 * Response: { schedules, pareto, dependenceVectors, legalOrders, notes }.
 *
 * Schedules are model-based estimates under the documented assumptions in
 * src/lib/accelerator/polyhedral.ts (two-level memory, per-tile reload, spill
 * multiplier). Validate the chosen schedule on the target memory system.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'request body must be valid JSON' }, { status: 422 });
  }

  const parsed = loopNestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'invalid loop nest',
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      },
      { status: 422 }
    );
  }

  try {
    return NextResponse.json(analyzeLoopNest(parsed.data));
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 422 });
  }
}
