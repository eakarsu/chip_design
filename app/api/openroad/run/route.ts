/**
 * OpenROAD step-runner endpoint.
 *
 * POST { steps, lefContent?, defContent?, libertyContent?, forceFallback?, tclScript? }
 *   → { ranReal, metrics, tcl, stdoutTail, stderrTail, exitCode, placedCells? }
 *
 * Drives the in-repo `runOpenROAD` wrapper. When the OpenROAD binary isn't
 * installed we silently fall back to the JS algorithms so the composer
 * still produces a metrics report (with `ranReal=false`).
 */

import { NextRequest, NextResponse } from 'next/server';
import { runOpenROAD, stepsToTcl, type OpenROADStep } from '@/lib/tools/openroad';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const steps: OpenROADStep[] = Array.isArray(body?.steps) ? body.steps : [];
    const tcl = body?.tclScript ?? stepsToTcl(steps);

    const report = await runOpenROAD({
      steps: body?.tclScript ? undefined : steps,
      tclScript: body?.tclScript,
      lefContent: body?.lefContent,
      defContent: body?.defContent,
      libertyContent: body?.libertyContent,
      forceFallback: body?.forceFallback ?? false,
    });

    return NextResponse.json({
      success: true,
      ranReal: report.ranReal,
      metrics: report.metrics,
      tcl,
      stdoutTail: report.stdoutTail,
      stderrTail: report.stderrTail,
      exitCode: report.exitCode,
      placedCells: report.placedCells,
    });
  } catch (e) {
    return NextResponse.json(
      { error: 'OpenROAD run failed', message: e instanceof Error ? e.message : String(e) },
      { status: 400 },
    );
  }
}
