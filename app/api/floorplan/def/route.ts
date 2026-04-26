/**
 * POST /api/floorplan/def — convert a Floorplan JSON object into a DEF text
 * stream. Returns plain text so the editor can offer a download or pipe it
 * to the OpenROAD composer.
 */
import { NextRequest, NextResponse } from 'next/server';
import { floorplanToDef, validateFloorplan, type Floorplan } from '@/lib/algorithms/floorplan';
import { writeDef } from '@/lib/parsers/def';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  let body: { floorplan?: Floorplan };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }

  const fp = body?.floorplan;
  if (!fp || typeof fp !== 'object' || !Array.isArray(fp.macros)) {
    return NextResponse.json({ error: 'missing or malformed "floorplan"' }, { status: 400 });
  }

  const issues = validateFloorplan(fp);
  const errors = issues.filter(i => i.severity === 'error');
  if (errors.length > 0) {
    return NextResponse.json({ error: 'floorplan has errors', issues }, { status: 422 });
  }

  const def = floorplanToDef(fp);
  const text = writeDef(def);
  return NextResponse.json({ def: text, issues });
}
