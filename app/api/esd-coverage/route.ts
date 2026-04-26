import { NextRequest, NextResponse } from 'next/server';
import { checkEsdCoverage } from '@/lib/tools/esd_coverage';
export const runtime = 'nodejs';
export async function POST(req: NextRequest) {
  let body: { pads?: unknown; devices?: unknown; maxDist?: number };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'invalid JSON' }, { status: 400 }); }
  if (!Array.isArray(body.pads) || !Array.isArray(body.devices) ||
      typeof body.maxDist !== 'number') {
    return NextResponse.json({ error: 'missing fields' }, { status: 400 });
  }
  try {
    return NextResponse.json(
      checkEsdCoverage(body.pads as never, body.devices as never, body.maxDist));
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) }, { status: 422 });
  }
}
