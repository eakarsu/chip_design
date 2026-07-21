import { NextRequest, NextResponse } from 'next/server';
import { openlaneRuns, openlaneDesigns } from '@/lib/db';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const run = openlaneRuns.get(id);
  if (!run) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const design = openlaneDesigns.get(run.designId);
  return NextResponse.json({ run, design });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const removed = openlaneRuns.delete(id);
  if (!removed) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
