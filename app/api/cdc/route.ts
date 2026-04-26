import { NextRequest, NextResponse } from 'next/server';
import { checkCdc } from '@/lib/tools/cdc';
export const runtime = 'nodejs';
export async function POST(req: NextRequest) {
  let body: { signals?: unknown; crossings?: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'invalid JSON' }, { status: 400 }); }
  if (!Array.isArray(body.signals) || !Array.isArray(body.crossings)) {
    return NextResponse.json({ error: 'missing signals/crossings' }, { status: 400 });
  }
  try { return NextResponse.json(checkCdc(body.signals as never, body.crossings as never)); }
  catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) }, { status: 422 });
  }
}
