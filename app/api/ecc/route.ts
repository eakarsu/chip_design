import { NextRequest, NextResponse } from 'next/server';
import { encodeEcc, decodeEcc } from '@/lib/tools/ecc';
export const runtime = 'nodejs';
export async function POST(req: NextRequest) {
  let body: { mode?: unknown; dataBits?: unknown; data?: unknown; codeword?: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'invalid JSON' }, { status: 400 }); }
  if (typeof body.dataBits !== 'number') {
    return NextResponse.json({ error: 'missing dataBits' }, { status: 400 });
  }
  try {
    if (body.mode === 'decode') {
      if (typeof body.codeword !== 'string') {
        return NextResponse.json({ error: 'codeword (string) required for decode' }, { status: 400 });
      }
      const r = decodeEcc(BigInt(body.codeword), body.dataBits);
      return NextResponse.json({ ...r, data: r.data.toString() });
    }
    if (typeof body.data !== 'string') {
      return NextResponse.json({ error: 'data (string) required for encode' }, { status: 400 });
    }
    const r = encodeEcc({ dataBits: body.dataBits, data: BigInt(body.data) });
    return NextResponse.json({ ...r, codeword: r.codeword.toString() });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) }, { status: 422 });
  }
}
