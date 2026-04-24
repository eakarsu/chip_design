/**
 * Static timing analysis endpoint.
 *
 * POST { cells, nets, clockPeriod, cellDelay?, wireDelayPerUnit?, cellDelays? }
 * returns WNS / TNS, critical path, and per-pin slack.
 */

import { NextRequest, NextResponse } from 'next/server';
import { runSTA } from '@/lib/algorithms/sta_graph';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!Array.isArray(body?.cells) || !Array.isArray(body?.nets)) {
      return NextResponse.json({ error: 'cells and nets arrays required' }, { status: 400 });
    }
    if (typeof body.clockPeriod !== 'number') {
      return NextResponse.json({ error: 'clockPeriod (number) required' }, { status: 400 });
    }
    const r = runSTA({
      cells: body.cells,
      nets:  body.nets,
      clockPeriod: body.clockPeriod,
      cellDelay:        body.cellDelay,
      wireDelayPerUnit: body.wireDelayPerUnit,
      cellDelays:       body.cellDelays,
    });
    return NextResponse.json({
      success: true,
      wns: r.wns,
      tns: r.tns,
      maxArrival: r.maxArrival,
      setupViolations: r.setupViolations,
      endpoints:   r.endpoints,
      startpoints: r.startpoints,
      criticalPath: r.criticalPath,
      pins: r.pins,
      runtimeMs: r.runtimeMs,
    });
  } catch (e) {
    return NextResponse.json(
      { error: 'STA failed', message: e instanceof Error ? e.message : String(e) },
      { status: 400 },
    );
  }
}
