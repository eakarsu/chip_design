/**
 * POST /api/gds/remap — apply a layer-remap table to a GdsLibrary JSON.
 *
 * Body: { lib: GdsLibrary, table: RemapTable }
 * Returns: { lib, report, histogram }
 */
import { NextRequest, NextResponse } from 'next/server';
import {
  remapLibrary, layerHistogram, parseRemapTable, type RemapTable,
} from '@/lib/tools/gds_remap';
import type { GdsLibrary } from '@/lib/gds/types';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  let body: { lib?: GdsLibrary; table?: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'invalid JSON' }, { status: 400 }); }

  if (!body.lib || !Array.isArray(body.lib.structures)) {
    return NextResponse.json({ error: 'missing or invalid "lib"' }, { status: 400 });
  }
  let table: RemapTable;
  try { table = parseRemapTable(body.table); }
  catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 422 },
    );
  }

  const result = remapLibrary(body.lib, table);
  return NextResponse.json({
    lib: result.lib,
    report: result.report,
    histogram: layerHistogram(result.lib),
  });
}
