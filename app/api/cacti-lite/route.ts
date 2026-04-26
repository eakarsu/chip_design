import { NextRequest, NextResponse } from 'next/server';
import { estimateCache } from '@/lib/tools/cacti_lite';
export const runtime = 'nodejs';
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'invalid JSON' }, { status: 400 }); }
  if (typeof body.sizeBytes !== 'number' || typeof body.lineBytes !== 'number'
   || typeof body.assoc !== 'number' || typeof body.addressBits !== 'number'
   || typeof body.techNm !== 'number') {
    return NextResponse.json({ error: 'missing required numeric fields' }, { status: 400 });
  }
  try { return NextResponse.json(estimateCache(body as never)); }
  catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) }, { status: 422 });
  }
}
