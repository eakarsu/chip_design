/**
 * Congestion heatmap endpoint.
 *
 * POST { cells, nets, chipWidth, chipHeight, tile? } returns either:
 *   - JSON with the demand grid + peak/mean (default)
 *   - image/svg+xml when ?format=svg
 */

import { NextRequest } from 'next/server';
import { computeCongestion, renderCongestionSvg } from '@/lib/render/congestion';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const cells = Array.isArray(body?.cells) ? body.cells : [];
    const nets  = Array.isArray(body?.nets)  ? body.nets  : [];
    const cw = body?.chipWidth  ?? 1000;
    const ch = body?.chipHeight ?? 1000;
    const tile = body?.tile ?? 50;
    const grid = computeCongestion(cells, nets, cw, ch, tile);
    const fmt = new URL(request.url).searchParams.get('format');
    if (fmt === 'svg') {
      const svg = renderCongestionSvg(grid, cells, cw, ch, body?.options ?? {});
      return new Response(svg, {
        headers: { 'Content-Type': 'image/svg+xml; charset=utf-8' },
      });
    }
    return Response.json({
      success: true,
      cols: grid.cols, rows: grid.rows, tile: grid.tile,
      peak: grid.peak, mean: grid.mean,
      demand: grid.demand,
    });
  } catch (e) {
    return new Response(
      `Congestion render failed: ${e instanceof Error ? e.message : String(e)}`,
      { status: 400 },
    );
  }
}
