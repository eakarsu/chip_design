export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import { estimateSpiralQ } from '@/lib/tools/spiral_q';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const r = estimateSpiralQ(body);
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 422 });
  }
}
