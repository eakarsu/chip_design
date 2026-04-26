export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import { calcLine } from '@/lib/tools/microstrip';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const r = calcLine(body);
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 422 });
  }
}
