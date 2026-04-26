import { NextRequest, NextResponse } from 'next/server';
import { stitchScan } from '@/lib/tools/scan_stitch';
export const runtime = 'nodejs';
export async function POST(req: NextRequest) {
  let body: { flops?: unknown; numChains?: unknown; scanIn?: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'invalid JSON' }, { status: 400 }); }
  if (!Array.isArray(body.flops) || typeof body.numChains !== 'number') {
    return NextResponse.json({ error: 'missing flops/numChains' }, { status: 400 });
  }
  try { return NextResponse.json(stitchScan(body as never)); }
  catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) }, { status: 422 });
  }
}
