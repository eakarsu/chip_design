export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import { designLcMatch } from '@/lib/tools/lc_match';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const r = designLcMatch(body);
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 422 });
  }
}
