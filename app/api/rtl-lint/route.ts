import { NextRequest, NextResponse } from 'next/server';
import { lintRtl } from '@/lib/tools/rtl_lint';
export const runtime = 'nodejs';
export async function POST(req: NextRequest) {
  let body: { source?: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'invalid JSON' }, { status: 400 }); }
  if (typeof body.source !== 'string') {
    return NextResponse.json({ error: 'missing source' }, { status: 400 });
  }
  try { return NextResponse.json(lintRtl(body.source)); }
  catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) }, { status: 422 });
  }
}
