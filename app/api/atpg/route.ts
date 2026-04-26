import { NextRequest, NextResponse } from 'next/server';
import { runAtpg } from '@/lib/tools/atpg';
export const runtime = 'nodejs';
export async function POST(req: NextRequest) {
  let body: { pis?: unknown; gates?: unknown; pos?: unknown; vectors?: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'invalid JSON' }, { status: 400 }); }
  if (!Array.isArray(body.pis) || !Array.isArray(body.gates)
   || !Array.isArray(body.pos) || typeof body.vectors !== 'number') {
    return NextResponse.json({ error: 'missing pis/gates/pos/vectors' }, { status: 400 });
  }
  try { return NextResponse.json(runAtpg(body as never)); }
  catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) }, { status: 422 });
  }
}
