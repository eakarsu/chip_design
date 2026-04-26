import { NextRequest, NextResponse } from 'next/server';
import { planSram } from '@/lib/tools/sram_planner';
export const runtime = 'nodejs';
export async function POST(req: NextRequest) {
  let body: { capacityBits?: unknown; wordBits?: unknown; cellAreaUm2?: unknown;
    muxFactor?: unknown; targetAccessNs?: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'invalid JSON' }, { status: 400 }); }
  if (typeof body.capacityBits !== 'number' || typeof body.wordBits !== 'number'
   || typeof body.cellAreaUm2 !== 'number' || typeof body.muxFactor !== 'number'
   || typeof body.targetAccessNs !== 'number') {
    return NextResponse.json({ error: 'missing required numeric fields' }, { status: 400 });
  }
  try { return NextResponse.json(planSram(body as never)); }
  catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) }, { status: 422 });
  }
}
