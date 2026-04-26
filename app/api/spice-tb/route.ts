export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import { emitSpiceTb } from '@/lib/tools/spice_tb';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body.dut || !Array.isArray(body.pins) || !Array.isArray(body.analyses)) {
      return NextResponse.json({ error: 'dut, pins, analyses required' }, { status: 400 });
    }
    const r = emitSpiceTb(body);
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 422 });
  }
}
