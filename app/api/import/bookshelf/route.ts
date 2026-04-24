/**
 * Bookshelf import endpoint.
 *
 * Accepts the contents of an ISPD-style design as plain text and returns
 * the parsed cells/nets so the caller can drop them into any algorithm
 * runner. We intentionally don't run a flow here — keeping the endpoint
 * focused makes it easier to reuse from the CLI, the UI, or tests.
 *
 * Body:
 *   { nodes: string, nets: string, pl?: string, aux?: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { parseBookshelfBundle } from '@/lib/io/bookshelf';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (typeof body?.nodes !== 'string' || typeof body?.nets !== 'string') {
      return NextResponse.json(
        { error: '`nodes` and `nets` text fields are required' },
        { status: 400 },
      );
    }
    const t0 = performance.now();
    const design = parseBookshelfBundle({
      nodes: body.nodes,
      nets:  body.nets,
      pl:    body.pl,
      aux:   body.aux,
    });
    return NextResponse.json({
      success: true,
      runtimeMs: performance.now() - t0,
      summary: {
        cells:         design.cells.length,
        nets:          design.nets.length,
        terminalCount: design.terminalCount,
      },
      design,
    });
  } catch (e) {
    return NextResponse.json(
      { error: 'Bookshelf import failed', message: e instanceof Error ? e.message : String(e) },
      { status: 400 },
    );
  }
}
