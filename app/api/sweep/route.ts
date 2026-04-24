/**
 * Parameter sweep endpoint.
 *
 * Exhaustively (grid) or stochastically (random) evaluates the SA
 * placer at points in a hyperparameter box. Returns every trial's
 * params + objective so the UI can plot the landscape.
 *
 * Body:
 *   {
 *     dims: [{name, min, max, integer?}, ...],
 *     strategy: 'grid' | 'random',
 *     steps?: number,    // grid points per dim
 *     samples?: number,  // random total samples
 *     seed?: number,
 *     cellCount?: number, netCount?: number,
 *   }
 */

import { NextRequest, NextResponse } from 'next/server';
import { parameterSweep } from '@/lib/algorithms/sweep';
import { runPlacement } from '@/lib/algorithms/placement';
import type { Cell, Net, PlacementParams } from '@/types/algorithms';

function makeCells(n: number): Cell[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `c${i}`, name: `c${i}`, width: 20, height: 20,
    pins: [
      { id: `c${i}_in`,  name: 'A', position: { x: 0,  y: 10 }, direction: 'input'  },
      { id: `c${i}_out`, name: 'Y', position: { x: 20, y: 10 }, direction: 'output' },
    ],
    type: 'standard',
  }));
}
function makeNets(cellCount: number, netCount: number): Net[] {
  return Array.from({ length: netCount }, (_, i) => ({
    id: `n${i}`, name: `n${i}`,
    pins: [`c${i % cellCount}_out`, `c${(i + 1) % cellCount}_in`],
    weight: 1,
  }));
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const dims = body.dims;
    if (!Array.isArray(dims) || dims.length === 0) {
      return NextResponse.json({ error: 'dims is required' }, { status: 400 });
    }

    const cellCount = body.cellCount ?? 24;
    const netCount  = body.netCount  ?? 32;
    const cells = makeCells(cellCount);
    const nets  = makeNets(cellCount, netCount);

    // Hard cap to keep the server responsive.
    const strategy = body.strategy === 'random' ? 'random' : 'grid';
    if (strategy === 'grid') {
      const totalPoints = (body.steps ?? 5) ** dims.length;
      if (totalPoints > 1000) {
        return NextResponse.json(
          { error: `Grid too large (${totalPoints} points). Reduce steps or use random strategy.` },
          { status: 400 },
        );
      }
    } else if ((body.samples ?? 50) > 500) {
      return NextResponse.json(
        { error: 'Random samples capped at 500.' },
        { status: 400 },
      );
    }

    const result = await parameterSweep(dims, (params) => {
      const p: PlacementParams = {
        algorithm: 'simulated_annealing' as any,
        chipWidth: 800, chipHeight: 800, cells, nets,
        iterations: Math.max(1, Math.round(params.iterations ?? 100)),
        temperature: params.temperature,
        coolingRate: params.coolingRate,
      } as any;
      return runPlacement(p).totalWirelength ?? Number.MAX_SAFE_INTEGER;
    }, {
      strategy,
      steps:   body.steps,
      samples: body.samples,
      seed:    body.seed,
    });

    return NextResponse.json({
      success: true,
      ...result,
      problem: { cellCount, netCount },
    });
  } catch (e) {
    return NextResponse.json(
      { error: 'Sweep failed', message: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
