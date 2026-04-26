/**
 * POST /api/density-fill — insert dummy-fill rects to hit a metal-density goal.
 *
 * Body: FillSpec  ({ window, obstacles, targetDensity?, cellW?, ... })
 * Returns: FillReport
 */
import { NextRequest, NextResponse } from 'next/server';
import { insertFill, type FillSpec } from '@/lib/tools/density_fill';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  let body: FillSpec;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'invalid JSON' }, { status: 400 }); }

  if (!body?.window || !Array.isArray(body.obstacles)) {
    return NextResponse.json(
      { error: 'missing "window" or "obstacles"' }, { status: 400 },
    );
  }
  try {
    return NextResponse.json(insertFill(body));
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 422 },
    );
  }
}
