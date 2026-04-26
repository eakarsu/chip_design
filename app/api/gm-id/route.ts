export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import { sizeGmId } from '@/lib/tools/gm_id';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (typeof body.gmTarget !== 'number' || typeof body.uCox !== 'number'
        || typeof body.L !== 'number' || !body.region) {
      return NextResponse.json({ error: 'gmTarget, uCox, L, region required' }, { status: 400 });
    }
    const r = sizeGmId(body);
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 422 });
  }
}
