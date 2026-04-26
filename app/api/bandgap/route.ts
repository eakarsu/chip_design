export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import { sweepBandgap } from '@/lib/tools/bandgap';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (typeof body.Tmin !== 'number' || typeof body.Tmax !== 'number') {
      return NextResponse.json({ error: 'Tmin and Tmax required' }, { status: 400 });
    }
    const r = sweepBandgap(body);
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 422 });
  }
}
