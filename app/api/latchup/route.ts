import { NextRequest, NextResponse } from 'next/server';
import { checkLatchup } from '@/lib/tools/latchup';
export const runtime = 'nodejs';
export async function POST(req: NextRequest) {
  let body: { devices?: unknown; taps?: unknown; maxTapDist?: number };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'invalid JSON' }, { status: 400 }); }
  if (!Array.isArray(body.devices) || !Array.isArray(body.taps) ||
      typeof body.maxTapDist !== 'number') {
    return NextResponse.json({ error: 'missing fields' }, { status: 400 });
  }
  try {
    return NextResponse.json(
      checkLatchup(body.devices as never, body.taps as never, body.maxTapDist));
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) }, { status: 422 });
  }
}
