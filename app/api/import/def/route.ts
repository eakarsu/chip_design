/**
 * DEF import endpoint.
 *
 * Accepts the contents of a .def file as plain text and returns the
 * parsed design bridged into engine `Cell[]` / `Net[]`. Mirror of the
 * Bookshelf importer.
 *
 * Body: { def: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { parseDefToEngine } from '@/lib/io/def_bridge';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (typeof body?.def !== 'string') {
      return NextResponse.json(
        { error: '`def` field with DEF text is required' },
        { status: 400 },
      );
    }
    const t0 = performance.now();
    const r = parseDefToEngine(body.def);
    return NextResponse.json({
      success: true,
      runtimeMs: performance.now() - t0,
      designName: r.designName,
      summary: {
        cells:    r.cells.length,
        nets:     r.nets.length,
        ioCount:  r.ioCount,
        warnings: r.warnings.length,
      },
      die: r.die,
      design: { cells: r.cells, nets: r.nets },
      warnings: r.warnings,
    });
  } catch (e) {
    return NextResponse.json(
      { error: 'DEF import failed', message: e instanceof Error ? e.message : String(e) },
      { status: 400 },
    );
  }
}
