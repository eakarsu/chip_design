export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import { smithDerive, smithArcs } from '@/lib/tools/smith';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!Array.isArray(body.points)) {
      return NextResponse.json({ error: 'points[] required' }, { status: 400 });
    }
    const Z0 = typeof body.Z0 === 'number' ? body.Z0 : 50;
    const derived = smithDerive(body.points, Z0);
    return NextResponse.json({ derived, arcs: smithArcs() });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 422 });
  }
}
