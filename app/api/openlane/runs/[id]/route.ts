import { NextRequest, NextResponse } from 'next/server';
import { openlaneRuns, openlaneDesigns } from '@/lib/db';

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const run = openlaneRuns.get(params.id);
  if (!run) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const design = openlaneDesigns.get(run.designId);
  return NextResponse.json({ run, design });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const removed = openlaneRuns.delete(params.id);
  if (!removed) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
