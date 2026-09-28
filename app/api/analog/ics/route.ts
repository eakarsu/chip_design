export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import { requirementsSchema } from '@/lib/analog/types';
import { selectBuckIcs } from '@/lib/analog/design';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const requirements = requirementsSchema.parse(body.requirements ?? body);
    return NextResponse.json(selectBuckIcs(requirements));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'IC selection failed';
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
