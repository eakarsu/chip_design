import { NextRequest, NextResponse } from 'next/server';
import { computeFIT, type FitSpec } from '@/lib/tools/fit_model';
export const runtime = 'nodejs';
export async function POST(req: NextRequest) {
  let body: Partial<FitSpec>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'invalid JSON' }, { status: 400 }); }
  if (!Array.isArray(body.mechanisms) ||
      typeof body.useK !== 'number' || typeof body.stressK !== 'number') {
    return NextResponse.json({ error: 'missing FIT spec fields' }, { status: 400 });
  }
  try { return NextResponse.json(computeFIT(body as FitSpec)); }
  catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) }, { status: 422 });
  }
}
