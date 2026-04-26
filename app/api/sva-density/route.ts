import { NextRequest, NextResponse } from 'next/server';
import { computeSvaDensity } from '@/lib/tools/sva_density';
export const runtime = 'nodejs';
export async function POST(req: NextRequest) {
  let body: { modules?: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'invalid JSON' }, { status: 400 }); }
  if (!Array.isArray(body.modules)) {
    return NextResponse.json({ error: 'missing modules' }, { status: 400 });
  }
  try { return NextResponse.json(computeSvaDensity(body as never)); }
  catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) }, { status: 422 });
  }
}
