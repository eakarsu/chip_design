export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import type { BuckDesign } from '@/lib/analog/types';
import { defaultPcbChecklist, reviewPcb } from '@/lib/analog/pcb';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const design = body.design as BuckDesign;
    if (!design?.ic) throw new Error('A design object is required');
    if (body.action === 'review') {
      return NextResponse.json(reviewPcb({ checks: body.checks, reviewerNote: body.reviewerNote }, design));
    }
    return NextResponse.json({ checklist: defaultPcbChecklist(design) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'PCB review failed';
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
