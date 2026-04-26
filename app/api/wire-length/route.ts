/**
 * POST /api/wire-length — HPWL report for a list of nets.
 *
 * Body: { nets: WireNet[] }
 * Returns: WireLengthResult
 */
import { NextRequest, NextResponse } from 'next/server';
import { computeWireLength, type WireNet } from '@/lib/tools/wire_length';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  let body: { nets?: WireNet[] };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'invalid JSON' }, { status: 400 }); }

  if (!Array.isArray(body.nets)) {
    return NextResponse.json({ error: 'missing or invalid "nets"' }, { status: 400 });
  }
  try {
    return NextResponse.json(computeWireLength(body.nets));
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) }, { status: 422 });
  }
}
