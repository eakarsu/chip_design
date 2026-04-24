import { NextRequest, NextResponse } from 'next/server';
import { openlaneDesigns, openlaneRuns } from '@/lib/db';

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const d = openlaneDesigns.get(params.id);
  if (!d) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const runs = openlaneRuns.byDesign(params.id)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  return NextResponse.json({ design: d, runs });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const body = await request.json();
    const d = openlaneDesigns.update(params.id, {
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
  { params }: { params: { id: string } },
) {
  // Cascade: drop every run that belongs to this design first so nothing
  // becomes orphaned. There's no FK cascade in the schema.
  const runsRemoved = openlaneRuns.deleteByDesign(params.id);
  const removed = openlaneDesigns.delete(params.id);
  if (!removed) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ ok: true, runsRemoved });
}
