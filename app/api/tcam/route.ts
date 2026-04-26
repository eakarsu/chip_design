import { NextRequest, NextResponse } from 'next/server';
import { estimateTcam } from '@/lib/tools/tcam';
export const runtime = 'nodejs';
export async function POST(req: NextRequest) {
  let body: Record<string, unknown> & { cap?: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'invalid JSON' }, { status: 400 }); }
  if (typeof body.entries !== 'number' || typeof body.widthBits !== 'number'
   || typeof body.cellType !== 'string' || typeof body.techNm !== 'number') {
    return NextResponse.json({ error: 'missing required fields' }, { status: 400 });
  }
  try {
    const cap = body.cap && typeof body.cap === 'object' ? body.cap as never : undefined;
    return NextResponse.json(estimateTcam(body as never, cap));
  }
  catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) }, { status: 422 });
  }
}
