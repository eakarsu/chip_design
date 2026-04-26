export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import { calcPllFilter } from '@/lib/tools/pll_filter';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (typeof body.fref !== 'number' || typeof body.fvco !== 'number'
        || typeof body.fc !== 'number' || typeof body.pmDeg !== 'number'
        || typeof body.kvco !== 'number' || typeof body.icp !== 'number') {
      return NextResponse.json({ error: 'fref, fvco, fc, pmDeg, kvco, icp required' }, { status: 400 });
    }
    const r = calcPllFilter(body);
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 422 });
  }
}
