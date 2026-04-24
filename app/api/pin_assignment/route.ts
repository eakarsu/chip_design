/**
 * Pin assignment endpoint.
 *
 * POST { cells, nets, chipWidth, chipHeight, slotsPerSide? } returns the
 * updated cells + per-port boundary assignments + HPWL deltas.
 */

import { NextRequest, NextResponse } from 'next/server';
import { assignPins } from '@/lib/algorithms/pin_assignment';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!Array.isArray(body?.cells) || !Array.isArray(body?.nets)) {
      return NextResponse.json({ error: 'cells and nets arrays required' }, { status: 400 });
    }
    const r = assignPins({
      cells: body.cells,
      nets:  body.nets,
      chipWidth:  body.chipWidth  ?? 1000,
      chipHeight: body.chipHeight ?? 1000,
      slotsPerSide: body.slotsPerSide,
    });
    return NextResponse.json({
      success: true,
      assignments: r.assignments,
      hpwlBefore: r.hpwlBefore,
      hpwlAfter:  r.hpwlAfter,
      improvementPct: r.hpwlBefore > 0
        ? ((r.hpwlBefore - r.hpwlAfter) / r.hpwlBefore) * 100
        : 0,
      cells: r.cells,
      runtimeMs: r.runtimeMs,
    });
  } catch (e) {
    return NextResponse.json(
      { error: 'Pin assignment failed', message: e instanceof Error ? e.message : String(e) },
      { status: 400 },
    );
  }
}
