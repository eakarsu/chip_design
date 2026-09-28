export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import { generateSystolicGemm, systolicConfigSchema } from '@/lib/accelerator/systolic';

/**
 * POST /api/accelerator/systolic
 *
 * Body: systolic GEMM configuration (M, N, K, tile sizes, dataflow, widths).
 * Response: { verilog, testbench, cycles, cyclesBreakdown, utilization, notes }.
 *
 * The returned RTL is GENERATED RTL - REQUIRES VERIFICATION: the bundled
 * self-checking testbench (iverilog/vvp) and a yosys synthesis run are the
 * expected next steps; see src/lib/accelerator/verify.ts.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'request body must be valid JSON' }, { status: 422 });
  }

  const parsed = systolicConfigSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'invalid systolic configuration',
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      },
      { status: 422 }
    );
  }

  try {
    return NextResponse.json(generateSystolicGemm(parsed.data));
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 422 });
  }
}
