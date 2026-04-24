/**
 * Bayesian-optimization auto-tune endpoint.
 *
 * Given a parameter search space and a small synthetic placement problem,
 * this endpoint runs a fixed budget of objective evaluations using the
 * GP+EI optimizer in `bayesopt.ts`. The objective minimizes total
 * wirelength of the SA placer at the proposed hyperparameters.
 *
 * Body:
 *   {
 *     dims: [{ name, min, max, integer? }, ...]
 *     budget?: number
 *     initialSamples?: number
 *     cellCount?: number
 *     netCount?: number
 *     seed?: number
 *   }
 */

import { NextRequest, NextResponse } from 'next/server';
import { bayesianOptimize, ParamDim } from '@/lib/algorithms/bayesopt';
import { runPlacement } from '@/lib/algorithms/placement';
import type { Cell, Net, PlacementParams } from '@/types/algorithms';

function makeCells(n: number): Cell[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `c${i}`,
    name: `c${i}`,
    width: 20,
    height: 20,
    pins: [
      { id: `c${i}_in`,  name: 'A', position: { x: 0,  y: 10 }, direction: 'input'  },
      { id: `c${i}_out`, name: 'Y', position: { x: 20, y: 10 }, direction: 'output' },
    ],
    type: 'standard',
  }));
}
function makeNets(cellCount: number, netCount: number): Net[] {
  return Array.from({ length: netCount }, (_, i) => ({
    id: `n${i}`,
    name: `n${i}`,
    pins: [`c${i % cellCount}_out`, `c${(i + 1) % cellCount}_in`],
    weight: 1,
  }));
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const dims = (body.dims ?? []) as ParamDim[];
    if (!Array.isArray(dims) || dims.length === 0) {
      return NextResponse.json({ error: 'dims is required' }, { status: 400 });
    }

    const cellCount = body.cellCount ?? 24;
    const netCount = body.netCount ?? 32;
    const cells = makeCells(cellCount);
    const nets = makeNets(cellCount, netCount);

    const objective = (params: Record<string, number>): number => {
      const p: PlacementParams = {
        algorithm: 'simulated_annealing' as any,
        chipWidth: 800,
        chipHeight: 800,
        cells,
        nets,
        iterations: Math.max(1, Math.round(params.iterations ?? 100)),
        // SA controls — only applied if present in dims; otherwise harmless.
        temperature: params.temperature,
        coolingRate: params.coolingRate,
      } as any;
      const r = runPlacement(p);
      return r.totalWirelength ?? Number.MAX_SAFE_INTEGER;
    };

    const result = await bayesianOptimize(dims, objective, {
      budget: body.budget ?? 15,
      initialSamples: body.initialSamples ?? 4,
      seed: body.seed ?? 0,
    });

    return NextResponse.json({
      success: true,
      best: result.best,
      trials: result.trials,
      trace: result.trace,
      runtimeMs: result.runtimeMs,
      problem: { cellCount, netCount },
    });
  } catch (e) {
    console.error('Auto-tune error:', e);
    return NextResponse.json(
      { error: 'Auto-tune failed', message: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
