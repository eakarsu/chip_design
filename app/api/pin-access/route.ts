/**
 * POST /api/pin-access — check track access for a list of pin shapes.
 *
 * Body: PinAccessSpec
 * Returns: PinAccessResult
 */
import { NextRequest, NextResponse } from 'next/server';
import { checkPinAccess, type PinAccessSpec } from '@/lib/tools/pin_access';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  let body: Partial<PinAccessSpec>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'invalid JSON' }, { status: 400 }); }
  if (!Array.isArray(body.pins) || !Array.isArray(body.tracks)) {
    return NextResponse.json(
      { error: 'missing or invalid {pins, tracks}' }, { status: 400 });
  }
  try {
    return NextResponse.json(checkPinAccess(body as PinAccessSpec));
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) }, { status: 422 });
  }
}
