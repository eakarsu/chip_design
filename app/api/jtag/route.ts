import { NextRequest, NextResponse } from 'next/server';
import { buildJtag } from '@/lib/tools/jtag';
export const runtime = 'nodejs';
export async function POST(req: NextRequest) {
  let body: { pins?: unknown; tms?: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'invalid JSON' }, { status: 400 }); }
  if (!Array.isArray(body.pins) || !Array.isArray(body.tms)) {
    return NextResponse.json({ error: 'missing pins/tms' }, { status: 400 });
  }
  try { return NextResponse.json(buildJtag(body as never)); }
  catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) }, { status: 422 });
  }
}
