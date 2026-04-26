import { NextRequest, NextResponse } from 'next/server';
import { triageLog } from '@/lib/tools/log_triage';
export const runtime = 'nodejs';
export async function POST(req: NextRequest) {
  let body: { log?: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'invalid JSON' }, { status: 400 }); }
  if (typeof body.log !== 'string') {
    return NextResponse.json({ error: 'missing log' }, { status: 400 });
  }
  try { return NextResponse.json(triageLog(body.log)); }
  catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) }, { status: 422 });
  }
}
