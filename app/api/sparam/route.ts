export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import { parseTouchstone, vswrFromS11, returnLossDb } from '@/lib/tools/sparam';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (typeof body.text !== 'string') {
      return NextResponse.json({ error: 'text (Touchstone) required' }, { status: 400 });
    }
    const f = parseTouchstone(body.text);
    const summary = f.samples.map(s => ({
      fHz: s.fHz,
      vswr: vswrFromS11(s.S11.re, s.S11.im),
      rlDb: returnLossDb(s.S11.re, s.S11.im),
    }));
    return NextResponse.json({ ...f, summary });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 422 });
  }
}
