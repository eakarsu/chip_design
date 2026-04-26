/**
 * POST /api/layer-bool — boolean ops + sizing on rect lists.
 *
 * Body modes:
 *   { op: 'and'|'or'|'xor'|'not', a: Rect[], b: Rect[] }
 *   { op: 'size', a: Rect[], delta: number }
 */
import { NextRequest, NextResponse } from 'next/server';
import {
  layerBool, layerSize, totalArea, type Rect, type BoolOp,
} from '@/lib/tools/layer_bool';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  let body: { op?: string; a?: Rect[]; b?: Rect[]; delta?: number };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'invalid JSON' }, { status: 400 }); }

  if (!Array.isArray(body.a)) {
    return NextResponse.json({ error: 'missing "a"' }, { status: 400 });
  }
  switch (body.op) {
    case 'and':
    case 'or':
    case 'xor':
    case 'not': {
      const result = layerBool(body.a, body.b ?? [], body.op as BoolOp);
      return NextResponse.json({ result, area: totalArea(result), count: result.length });
    }
    case 'size': {
      const delta = typeof body.delta === 'number' ? body.delta : 0;
      const result = layerSize(body.a, delta);
      return NextResponse.json({ result, area: totalArea(result), count: result.length });
    }
    default:
      return NextResponse.json({ error: 'invalid "op"' }, { status: 400 });
  }
}
