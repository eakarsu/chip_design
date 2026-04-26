/**
 * POST /api/wafer — dies-per-wafer + reticle packing.
 *
 * Body modes:
 *   { mode: "dpw", spec: WaferSpec }     → WaferResult
 *   { mode: "reticle", spec: ReticleSpec } → ReticleResult
 */
import { NextRequest, NextResponse } from 'next/server';
import {
  computeDiesPerWafer, packReticle,
  type WaferSpec, type ReticleSpec,
} from '@/lib/tools/wafer';

export const runtime = 'nodejs';

interface DpwBody { mode: 'dpw'; spec: WaferSpec }
interface ReticleBody { mode: 'reticle'; spec: ReticleSpec }

export async function POST(req: NextRequest) {
  let body: Partial<DpwBody | ReticleBody>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'invalid JSON' }, { status: 400 }); }
  if (body.mode !== 'dpw' && body.mode !== 'reticle') {
    return NextResponse.json(
      { error: 'mode must be "dpw" or "reticle"' }, { status: 400 });
  }
  if (!body.spec) {
    return NextResponse.json({ error: 'missing "spec"' }, { status: 400 });
  }
  try {
    if (body.mode === 'dpw') {
      return NextResponse.json(computeDiesPerWafer(body.spec as WaferSpec));
    }
    return NextResponse.json(packReticle(body.spec as ReticleSpec));
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) }, { status: 422 });
  }
}
