import { NextRequest, NextResponse } from 'next/server';
import { generateStim } from '@/lib/tools/stim_gen';
export const runtime = 'nodejs';
export async function POST(req: NextRequest) {
  let body: { fields?: unknown; vectors?: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'invalid JSON' }, { status: 400 }); }
  if (!Array.isArray(body.fields) || typeof body.vectors !== 'number') {
    return NextResponse.json({ error: 'missing fields/vectors' }, { status: 400 });
  }
  try { return NextResponse.json(generateStim(body as never)); }
  catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) }, { status: 422 });
  }
}
