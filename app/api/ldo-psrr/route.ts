export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import { estimateLdoPsrr } from '@/lib/tools/ldo_psrr';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (typeof body.A0 !== 'number' || typeof body.fp1 !== 'number'
        || typeof body.cout !== 'number' || typeof body.beta !== 'number'
        || typeof body.gmp !== 'number') {
      return NextResponse.json({ error: 'A0, fp1, cout, beta, gmp required' }, { status: 400 });
    }
    const r = estimateLdoPsrr(body);
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 422 });
  }
}
