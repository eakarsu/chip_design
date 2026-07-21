import { NextRequest, NextResponse } from 'next/server';
import { openlaneDesigns, openlaneRuns } from '@/lib/db';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const d = openlaneDesigns.get(id);
  if (!d) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const runs = openlaneRuns.byDesign(id)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  return NextResponse.json({ design: d, runs });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const d = openlaneDesigns.update(id, {
      name: body.name,
      rtl: body.rtl,
      ports: body.ports,
      clocks: body.clocks,
      config: body.config,
    });
    if (!d) return NextResponse.json({ error: 'not found' }, { status: 404 });
    return NextResponse.json({ design: d });
  } catch (e) {
    return NextResponse.json(
      { error: 'Failed to update', message: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  // Cascade: drop every run that belongs to this design first so nothing
  // becomes orphaned. There's no FK cascade in the schema.
  const runsRemoved = openlaneRuns.deleteByDesign(id);
  const removed = openlaneDesigns.delete(id);
  if (!removed) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ ok: true, runsRemoved });
}
