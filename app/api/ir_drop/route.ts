/**
 * IR-drop endpoint.
 *
 * POST { cols, rows, edgeR, vdd, loadI?, pads, ... } returns the per-tile
 * voltage + drop arrays along with worst/mean stats.
 */

import { NextRequest, NextResponse } from 'next/server';
import { solveIRDrop, IRDropInput } from '@/lib/algorithms/ir_drop';

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as IRDropInput;
    if (!body || typeof body.cols !== 'number' || typeof body.rows !== 'number') {
      return NextResponse.json({ error: 'cols, rows required' }, { status: 400 });
    }
    if (body.cols * body.rows > 100_000) {
      return NextResponse.json(
        { error: `Grid too large (${body.cols * body.rows} tiles, cap 100k)` },
        { status: 400 },
      );
    }
    const r = solveIRDrop(body);
    return NextResponse.json({
      success: true,
      cols: body.cols, rows: body.rows,
      voltage: r.voltage,
      drop: r.drop,
      worstDrop: r.worstDrop,
      meanDrop: r.meanDrop,
      iterations: r.iterations,
      residual: r.residual,
      runtimeMs: r.runtimeMs,
    });
  } catch (e) {
    return NextResponse.json(
      { error: 'IR-drop solve failed', message: e instanceof Error ? e.message : String(e) },
      { status: 400 },
    );
  }
}
