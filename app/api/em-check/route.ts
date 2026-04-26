import { NextRequest, NextResponse } from 'next/server';
import { checkEM } from '@/lib/tools/em_check';
export const runtime = 'nodejs';
export async function POST(req: NextRequest) {
  let body: { segments?: unknown; layers?: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'invalid JSON' }, { status: 400 }); }
  if (!Array.isArray(body.segments) || !Array.isArray(body.layers)) {
    return NextResponse.json({ error: 'missing segments/layers' }, { status: 400 });
  }
  try { return NextResponse.json(checkEM(body.segments as never, body.layers as never)); }
  catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) }, { status: 422 });
  }
}
