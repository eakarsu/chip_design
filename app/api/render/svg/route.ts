/**
 * SVG renderer endpoint.
 *
 * Accepts cells/nets and returns an `image/svg+xml` document. Useful for
 * downloads from the history UI and for embedding placement snapshots in
 * external dashboards.
 */

import { NextRequest } from 'next/server';
import { renderPlacementSvg } from '@/lib/render/svg';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const cells = Array.isArray(body?.cells) ? body.cells : [];
    const nets  = Array.isArray(body?.nets)  ? body.nets  : undefined;
    const cw = body?.chipWidth  ?? 1000;
    const ch = body?.chipHeight ?? 1000;
    const svg = renderPlacementSvg(cells, nets, cw, ch, body?.options ?? {});
    return new Response(svg, {
      headers: {
        'Content-Type': 'image/svg+xml; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    return new Response(
      `Render failed: ${e instanceof Error ? e.message : String(e)}`,
      { status: 400 },
    );
  }
}
