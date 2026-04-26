import { NextRequest, NextResponse } from 'next/server';
import { mergeCoverage } from '@/lib/tools/cov_merge';
export const runtime = 'nodejs';
export async function POST(req: NextRequest) {
  let body: { dbs?: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'invalid JSON' }, { status: 400 }); }
  if (!Array.isArray(body.dbs)) {
    return NextResponse.json({ error: 'missing dbs' }, { status: 400 });
  }
  try { return NextResponse.json(mergeCoverage(body as never)); }
  catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) }, { status: 422 });
  }
}
