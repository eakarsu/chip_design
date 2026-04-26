import { NextRequest, NextResponse } from 'next/server';
import { planIddq } from '@/lib/tools/iddq';
export const runtime = 'nodejs';
export async function POST(req: NextRequest) {
  let body: { vectors?: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'invalid JSON' }, { status: 400 }); }
  if (!Array.isArray(body.vectors)) {
    return NextResponse.json({ error: 'missing vectors' }, { status: 400 });
  }
  try { return NextResponse.json(planIddq(body as never)); }
  catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) }, { status: 422 });
  }
}
