/**
 * POST /api/tap-endcap — insert tap cells + endcaps into a Floorplan.
 *
 * Body: { floorplan: Floorplan, spec: TapSpec }
 * Returns: TapResult
 */
import { NextRequest, NextResponse } from 'next/server';
import { insertTapsAndEndcaps, type TapSpec } from '@/lib/tools/tap_endcap';
import type { Floorplan } from '@/lib/algorithms/floorplan';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  let body: { floorplan?: Floorplan; spec?: TapSpec };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'invalid JSON' }, { status: 400 }); }

  if (!body.floorplan || !Array.isArray(body.floorplan.rows)) {
    return NextResponse.json({ error: 'missing or invalid "floorplan"' }, { status: 400 });
  }
  if (!body.spec) {
    return NextResponse.json({ error: 'missing "spec"' }, { status: 400 });
  }
  try {
    return NextResponse.json(insertTapsAndEndcaps(body.floorplan, body.spec));
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 422 },
    );
  }
}
