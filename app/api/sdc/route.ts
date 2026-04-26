/**
 * POST /api/sdc — parse and/or emit SDC.
 *
 * Body modes:
 *   { sdc: string }                         — parse text → constraints + summary + canonical emit
 *   { constraints: SdcConstraints }         — emit constraints → text
 */
import { NextRequest, NextResponse } from 'next/server';
import { parseSdc, type SdcConstraints } from '@/lib/parsers/sdc';
import { emitSdc, summariseSdc } from '@/lib/tools/sdc_writer';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  let body: { sdc?: string; constraints?: SdcConstraints };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'invalid JSON' }, { status: 400 }); }

  if (typeof body.sdc === 'string') {
    const constraints = parseSdc(body.sdc);
    return NextResponse.json({
      constraints,
      summary: summariseSdc(constraints),
      emitted: emitSdc(constraints),
    });
  }
  if (body.constraints) {
    const text = emitSdc(body.constraints);
    return NextResponse.json({ emitted: text, summary: summariseSdc(body.constraints) });
  }
  return NextResponse.json(
    { error: 'provide one of: sdc, constraints' },
    { status: 400 },
  );
}
