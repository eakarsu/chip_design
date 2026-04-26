import { NextRequest, NextResponse } from 'next/server';
import { combineHotspots, type RelGrid } from '@/lib/tools/rel_hotspot';
export const runtime = 'nodejs';
export async function POST(req: NextRequest) {
  let body: { ir?: RelGrid; em?: RelGrid; topN?: number };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'invalid JSON' }, { status: 400 }); }
  if (!body.ir || !body.em) {
    return NextResponse.json({ error: 'missing ir/em grids' }, { status: 400 });
  }
  try {
    return NextResponse.json(combineHotspots(body.ir, body.em, body.topN ?? 10));
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) }, { status: 422 });
  }
}
