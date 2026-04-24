/**
 * Streaming algorithm runner.
 *
 * GET /api/algorithms/stream?algorithm=simulated_annealing&...
 *
 * Returns Server-Sent Events with `iter`, `cost`, `temperature`, `bestCost`
 * fields per iteration. Currently supports simulated-annealing placement;
 * other algorithms can be added by emitting events from inside their loop.
 */

import { NextRequest } from 'next/server';
import type { Cell, Net } from '@/types/algorithms';

interface StreamParams {
  cellCount: number;
  netCount: number;
  chipWidth: number;
  chipHeight: number;
  iterations: number;
  temperature: number;
  coolingRate: number;
}

function makeCells(n: number, chipW: number, chipH: number): Cell[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `c${i}`,
    name: `c${i}`,
    width: 20,
    height: 20,
    position: { x: Math.random() * (chipW - 20), y: Math.random() * (chipH - 20) },
    pins: [
      { id: `c${i}_in`, name: 'A', position: { x: 0, y: 10 }, direction: 'input' as const },
      { id: `c${i}_out`, name: 'Y', position: { x: 20, y: 10 }, direction: 'output' as const },
    ],
    type: 'standard' as const,
  }));
}

function makeNets(cellCount: number, netCount: number): Net[] {
  return Array.from({ length: netCount }, (_, i) => ({
    id: `n${i}`,
    name: `n${i}`,
    pins: [
      `c${i % cellCount}_out`,
      `c${(i + 1) % cellCount}_in`,
    ],
    weight: 1,
  }));
}

function hpwl(cells: Cell[], nets: Net[]): number {
  const pinAt = new Map<string, { x: number; y: number }>();
  for (const c of cells) {
    if (!c.position) continue;
    for (const p of c.pins) {
      pinAt.set(p.id, {
        x: c.position.x + p.position.x,
        y: c.position.y + p.position.y,
      });
    }
  }
  let total = 0;
  for (const net of nets) {
    let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity, k = 0;
    for (const pid of net.pins) {
      const p = pinAt.get(pid);
      if (!p) continue;
      if (p.x < xMin) xMin = p.x; if (p.x > xMax) xMax = p.x;
      if (p.y < yMin) yMin = p.y; if (p.y > yMax) yMax = p.y;
      k++;
    }
    if (k > 0) total += (xMax - xMin + yMax - yMin);
  }
  return total;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const params: StreamParams = {
    cellCount: Number(url.searchParams.get('cellCount') ?? 30),
    netCount: Number(url.searchParams.get('netCount') ?? 40),
    chipWidth: Number(url.searchParams.get('chipWidth') ?? 1000),
    chipHeight: Number(url.searchParams.get('chipHeight') ?? 1000),
    iterations: Number(url.searchParams.get('iterations') ?? 500),
    temperature: Number(url.searchParams.get('temperature') ?? 1000),
    coolingRate: Number(url.searchParams.get('coolingRate') ?? 0.995),
  };

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: any) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      };

      const cells = makeCells(params.cellCount, params.chipWidth, params.chipHeight);
      const nets = makeNets(params.cellCount, params.netCount);
      let temp = params.temperature;
      let cost = hpwl(cells, nets);
      let bestCost = cost;

      send('start', {
        cellCount: params.cellCount,
        netCount: params.netCount,
        initialCost: cost,
      });

      // Sample at most every 10 iters to avoid flooding the stream.
      const sampleEvery = Math.max(1, Math.floor(params.iterations / 100));

      for (let iter = 0; iter < params.iterations; iter++) {
        // Single-cell perturbation.
        const i = Math.floor(Math.random() * cells.length);
        const c = cells[i];
        const oldPos = c.position!;
        c.position = {
          x: Math.max(0, Math.min(params.chipWidth - c.width,
            oldPos.x + (Math.random() - 0.5) * 100)),
          y: Math.max(0, Math.min(params.chipHeight - c.height,
            oldPos.y + (Math.random() - 0.5) * 100)),
        };
        const newCost = hpwl(cells, nets);
        const delta = newCost - cost;
        if (delta < 0 || Math.random() < Math.exp(-delta / Math.max(1e-6, temp))) {
          cost = newCost;
          if (cost < bestCost) bestCost = cost;
        } else {
          c.position = oldPos;
        }
        temp *= params.coolingRate;

        if (iter % sampleEvery === 0 || iter === params.iterations - 1) {
          send('iter', {
            iter,
            cost: Math.round(cost),
            bestCost: Math.round(bestCost),
            temperature: Number(temp.toFixed(3)),
          });
          // Yield so the buffer flushes.
          await new Promise(r => setTimeout(r, 0));
        }
      }

      send('done', {
        finalCost: Math.round(cost),
        bestCost: Math.round(bestCost),
        improvement: bestCost > 0 ? 0 : 0,
      });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
