export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import { genCommonCentroid } from '@/lib/tools/common_centroid';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (typeof body.groups !== 'number' || typeof body.unitsPerGroup !== 'number') {
      return NextResponse.json({ error: 'groups and unitsPerGroup required' }, { status: 400 });
    }
    const r = genCommonCentroid(body);
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 422 });
  }
}
