/**
 * POST /api/openroad/irdrop — parse an `analyze_power_grid` / `report_voltage`
 * stdout payload into structured per-instance / per-net IR-drop data.
 */
import { NextRequest, NextResponse } from 'next/server';
import { parseIRReport } from '@/lib/tools/irdrop';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  let body: { stdout?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'invalid JSON' }, { status: 400 }); }
  if (typeof body?.stdout !== 'string' || body.stdout.length === 0) {
    return NextResponse.json({ error: 'missing "stdout" string' }, { status: 400 });
  }
  return NextResponse.json(parseIRReport(body.stdout));
}
