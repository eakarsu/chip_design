import { NextRequest, NextResponse } from 'next/server';
import { projectAging, type AgingSpec } from '@/lib/tools/aging';
export const runtime = 'nodejs';
export async function POST(req: NextRequest) {
  let body: Partial<AgingSpec>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'invalid JSON' }, { status: 400 }); }
  if (typeof body.alpha !== 'number' || typeof body.tempK !== 'number' ||
      typeof body.years !== 'number' || typeof body.vgs !== 'number') {
    return NextResponse.json({ error: 'missing aging spec fields' }, { status: 400 });
  }
  try { return NextResponse.json(projectAging(body as AgingSpec)); }
  catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) }, { status: 422 });
  }
}
