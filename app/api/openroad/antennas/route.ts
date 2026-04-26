/**
 * Antenna-violations endpoint.
 *
 * POST { stdout?: string, lefContent?, defContent?, libertyContent?, forceFallback? }
 *   → { report: AntennaReport, stdoutTail, ranReal }
 *
 * Mirrors the timing-paths endpoint pattern: pass `stdout` directly to
 * parse a pre-existing dump, or omit it and we'll drive a single
 * `check_antennas` step through `runOpenROAD`.
 */

import { NextRequest, NextResponse } from 'next/server';
import { runOpenROAD } from '@/lib/tools/openroad';
import { parseAntennaReport } from '@/lib/tools/antennas';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (typeof body?.stdout === 'string' && body.stdout.length > 0) {
      return NextResponse.json({
        success: true,
        ranReal: false,
        report: parseAntennaReport(body.stdout),
        stdoutTail: body.stdout.slice(-2000),
      });
    }

    const report = await runOpenROAD({
      lefContent: body?.lefContent,
      defContent: body?.defContent,
      libertyContent: body?.libertyContent,
      forceFallback: body?.forceFallback ?? false,
      steps: [
        ...(body?.lefContent ? [{ kind: 'read_lef' as const, path: '' }] : []),
        ...(body?.defContent ? [{ kind: 'read_def' as const, path: '' }] : []),
        { kind: 'check_antennas' as const },
      ],
    });

    return NextResponse.json({
      success: true,
      ranReal: report.ranReal,
      report: parseAntennaReport(report.stdoutTail),
      stdoutTail: report.stdoutTail,
    });
  } catch (e) {
    return NextResponse.json(
      { error: 'Antenna check failed', message: e instanceof Error ? e.message : String(e) },
      { status: 400 },
    );
  }
}
