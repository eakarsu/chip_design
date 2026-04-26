import { NextRequest, NextResponse } from 'next/server';
import { planBistWrap } from '@/lib/tools/bist_wrap';
export const runtime = 'nodejs';
export async function POST(req: NextRequest) {
  let body: { memories?: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'invalid JSON' }, { status: 400 }); }
  if (!Array.isArray(body.memories)) {
    return NextResponse.json({ error: 'missing memories' }, { status: 400 });
  }
  try { return NextResponse.json(planBistWrap(body as never)); }
  catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) }, { status: 422 });
  }
}
