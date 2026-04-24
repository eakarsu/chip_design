/**
 * OpenLane simulation — runs endpoint.
 *
 * POST kicks off the full 10-stage flow synchronously (everything is
 * fast in-process) and stores the result so `/openlane/runs/[id]` can
 * render reports, logs, and metrics immediately.
 */

import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { openlaneDesigns, openlaneRuns } from '@/lib/db';
import { runOpenlaneFlow, OpenlaneConfig } from '@/lib/openlane/orchestrator';

export async function GET() {
  const runs = openlaneRuns.list()
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .slice(0, 200);
  return NextResponse.json({ runs });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const designId = String(body.designId ?? '');
    if (!designId) {
      return NextResponse.json({ error: 'designId is required' }, { status: 400 });
    }
    const design = openlaneDesigns.get(designId);
    if (!design) {
      return NextResponse.json({ error: 'design not found' }, { status: 404 });
    }
    const userConfig: OpenlaneConfig = (body.config ?? {}) as OpenlaneConfig;
    const mergedConfig = { ...design.config, ...userConfig };

    const tag = `RUN_${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`;
    const runId = randomUUID();

    // Persist "running" so the run shows up in the UI even if the caller
    // refreshes before we finish. (Flow is synchronous and fast, but keep
    // the state machine honest.)
    const emptyLayout = { chipWidth: 0, chipHeight: 0, cells: [], wires: [] };
    openlaneRuns.create({
      id: runId, designId, tag, status: 'running',
      config: mergedConfig, stages: [], metrics: {},
      layout: emptyLayout, totalRuntimeMs: 0,
    });

    let result;
    try {
      result = runOpenlaneFlow(design, mergedConfig);
    } catch (e) {
      openlaneRuns.finalize(runId, {
        status: 'failed', stages: [], metrics: {},
        layout: emptyLayout, totalRuntimeMs: 0,
      });
      return NextResponse.json(
        { error: 'flow crashed', message: e instanceof Error ? e.message : String(e) },
        { status: 500 },
      );
    }

    const finalized = openlaneRuns.finalize(runId, {
      status: result.status,
      stages: result.stages,
      metrics: result.metrics,
      layout: result.layout,
      totalRuntimeMs: result.totalRuntimeMs,
    });
    return NextResponse.json({ run: finalized }, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: 'Failed to start run', message: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
