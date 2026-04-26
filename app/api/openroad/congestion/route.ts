/**
 * POST /api/openroad/congestion — parse an OpenROAD congestion-report
 * stdout payload into structured tiles + per-layer summaries.
 *
 * The frontend either uploads a saved report file or pipes through OpenROAD
 * stdout.
 */
import { NextRequest, NextResponse } from 'next/server';
import { parseCongestionReport } from '@/lib/tools/congestion_report';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  let body: { stdout?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }
  if (typeof body?.stdout !== 'string' || body.stdout.length === 0) {
    return NextResponse.json({ error: 'missing "stdout" string' }, { status: 400 });
  }
  return NextResponse.json(parseCongestionReport(body.stdout));
}
