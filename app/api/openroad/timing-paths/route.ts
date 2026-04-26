/**
 * Timing-paths endpoint.
 *
 * POST { stdout?: string, lefContent?, defContent?, libertyContent?, pathCount?, pathDelay?, forceFallback? }
 *   → { paths: TimingPath[], stdoutTail, ranReal }
 *
 * Two modes:
 * 1. If `stdout` is provided, parse it directly (offline mode — paste an
 *    existing OpenSTA report_checks dump).
 * 2. Otherwise drive `runOpenROAD` with a single `report_checks` step and
 *    parse its stdout. Falls back gracefully when the binary is absent.
 */

import { NextRequest, NextResponse } from 'next/server';
import { runOpenROAD, parseTimingPaths } from '@/lib/tools/openroad';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (typeof body?.stdout === 'string' && body.stdout.length > 0) {
      return NextResponse.json({
        success: true,
        ranReal: false,
        paths: parseTimingPaths(body.stdout),
        stdoutTail: body.stdout.slice(-2000),
      });
    }

    const report = await runOpenROAD({
      lefContent: body?.lefContent,
      defContent: body?.defContent,
      libertyContent: body?.libertyContent,
      forceFallback: body?.forceFallback ?? false,
      steps: [
        ...(body?.lefContent     ? [{ kind: 'read_lef'     as const, path: '' }] : []),
        ...(body?.libertyContent ? [{ kind: 'read_liberty' as const, path: '' }] : []),
        ...(body?.defContent     ? [{ kind: 'read_def'     as const, path: '' }] : []),
        {
          kind: 'report_checks' as const,
          pathCount: typeof body?.pathCount === 'number' ? body.pathCount : 10,
          pathDelay: body?.pathDelay ?? 'max',
        },
      ],
    });

    return NextResponse.json({
      success: true,
      ranReal: report.ranReal,
      paths: parseTimingPaths(report.stdoutTail),
      stdoutTail: report.stdoutTail,
    });
  } catch (e) {
    return NextResponse.json(
      { error: 'Timing path query failed', message: e instanceof Error ? e.message : String(e) },
      { status: 400 },
    );
  }
}
