/**
 * POST /api/gds/hierarchy — analyse a GdsLibrary's cell hierarchy.
 *
 * Body: { lib: GdsLibrary, root?: string }
 * Returns: { hierarchy: HierarchyResult, flattened?: { name; count }[] }
 */
import { NextRequest, NextResponse } from 'next/server';
import { analyseHierarchy, flattenCounts } from '@/lib/tools/gds_hier';
import type { GdsLibrary } from '@/lib/gds/types';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  let body: { lib?: GdsLibrary; root?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'invalid JSON' }, { status: 400 }); }

  if (!body.lib || !Array.isArray(body.lib.structures)) {
    return NextResponse.json({ error: 'missing or invalid "lib"' }, { status: 400 });
  }
  const hierarchy = analyseHierarchy(body.lib);
  const root = body.root ?? hierarchy.tops[0];
  const flattened = root ? flattenCounts(hierarchy, root) : undefined;
  return NextResponse.json({ hierarchy, flattened, root });
}
