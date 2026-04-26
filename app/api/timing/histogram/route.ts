/**
 * POST /api/timing/histogram — bin slacks from either:
 *   { stdout: string }              — OpenSTA report_checks output
 *   { paths: TimingPath[] }         — already-parsed paths
 *   { slacks: number[] }            — flat array of slack values
 * plus optional opts: { bins?, min?, max?, criticalMargin? }.
 */
import { NextRequest, NextResponse } from 'next/server';
import { parseTimingPaths } from '@/lib/tools/openroad';
import { binSlacks } from '@/lib/tools/slack_hist';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  let body: {
    stdout?: string;
    paths?: { slack: number }[];
    slacks?: number[];
    bins?: number;
    min?: number;
    max?: number;
    criticalMargin?: number;
  };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'invalid JSON' }, { status: 400 }); }

  const opts = {
    bins: body.bins,
    min: body.min,
    max: body.max,
    criticalMargin: body.criticalMargin,
  };

  if (Array.isArray(body.slacks)) {
    return NextResponse.json(binSlacks(body.slacks, opts));
  }
  if (Array.isArray(body.paths)) {
    return NextResponse.json(binSlacks(body.paths as never, opts));
  }
  if (typeof body.stdout === 'string') {
    const paths = parseTimingPaths(body.stdout);
    return NextResponse.json({ ...binSlacks(paths, opts), parsed: paths.length });
  }
  return NextResponse.json(
    { error: 'provide one of: stdout, paths, slacks' },
    { status: 400 },
  );
}
