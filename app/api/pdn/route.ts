/**
 * POST /api/pdn — generate PDN shapes + DEF from a parametric spec.
 *
 * Body: { spec: PdnSpec }
 * Returns: { rings, stripes, straps, metrics, def }
 */
import { NextRequest, NextResponse } from 'next/server';
import { generatePdn, emitDef, type PdnSpec } from '@/lib/tools/pdn';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  let body: { spec?: PdnSpec };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'invalid JSON' }, { status: 400 }); }

  if (!body.spec || typeof body.spec !== 'object') {
    return NextResponse.json({ error: 'missing "spec"' }, { status: 400 });
  }
  try {
    const result = generatePdn(body.spec);
    const def = emitDef(result, body.spec);
    return NextResponse.json({ ...result, def });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 422 },
    );
  }
}
