import { NextRequest, NextResponse } from 'next/server';
import { planMbist } from '@/lib/tools/mbist';
export const runtime = 'nodejs';
export async function POST(req: NextRequest) {
  let body: { macros?: unknown; clockNs?: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'invalid JSON' }, { status: 400 }); }
  if (!Array.isArray(body.macros) || typeof body.clockNs !== 'number') {
    return NextResponse.json({ error: 'missing macros/clockNs' }, { status: 400 });
  }
  try { return NextResponse.json(planMbist(body as never)); }
  catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) }, { status: 422 });
  }
}
