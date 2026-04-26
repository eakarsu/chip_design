/**
 * POST /api/bump-rdl — plan a flip-chip bump array + RDL fanout.
 *
 * Body: BumpRdlSpec
 * Returns: BumpRdlResult
 */
import { NextRequest, NextResponse } from 'next/server';
import { planBumps, type BumpRdlSpec } from '@/lib/tools/bump_rdl';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  let body: Partial<BumpRdlSpec>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'invalid JSON' }, { status: 400 }); }
  if (!body.die || typeof body.pitch !== 'number' ||
      typeof body.diameter !== 'number' || !Array.isArray(body.pads)) {
    return NextResponse.json({ error: 'missing or invalid spec' }, { status: 400 });
  }
  try {
    return NextResponse.json(planBumps(body as BumpRdlSpec));
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) }, { status: 422 });
  }
}
