/**
 * OpenLane simulation — designs endpoint.
 *
 * Open for local dev (no auth) so the `/openlane` UI works without a
 * session token. Harden this before shipping to anything shared.
 */

import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { openlaneDesigns } from '@/lib/db';

export async function GET() {
  try {
    const list = openlaneDesigns.list()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return NextResponse.json({ designs: list });
  } catch (e) {
    return NextResponse.json(
      { error: 'Failed to list designs', message: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const name = String(body.name ?? '').trim();
    if (!name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }
    const design = openlaneDesigns.create({
      id: randomUUID(),
      name,
      rtl: String(body.rtl ?? ''),
      ports: Array.isArray(body.ports) ? body.ports : [],
      clocks: Array.isArray(body.clocks) ? body.clocks : [],
      config: body.config && typeof body.config === 'object' ? body.config : {},
    });
    return NextResponse.json({ design }, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: 'Failed to create design', message: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
