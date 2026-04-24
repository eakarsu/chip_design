/**
 * LEF library endpoint.
 *
 * POST { lef: string } → returns a slim summary suitable for the UI:
 *   - sites, layers, macro count
 *   - per-macro: name, class, size, pin count
 *   - per-pin (when ?detail=true): direction, use, port layers
 */

import { NextRequest, NextResponse } from 'next/server';
import { parseLef } from '@/lib/parsers/lef';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (typeof body?.lef !== 'string') {
      return NextResponse.json({ error: '`lef` field required' }, { status: 400 });
    }
    const detail = new URL(request.url).searchParams.get('detail') === 'true';
    const t0 = performance.now();
    const lib = parseLef(body.lef);
    const macros = lib.macros.map(m => ({
      name: m.name,
      class: m.class ?? null,
      width: m.size.width,
      height: m.size.height,
      site: m.site ?? null,
      pinCount: m.pins.length,
      pins: detail ? m.pins.map(p => ({
        name: p.name,
        direction: p.direction ?? 'UNSPEC',
        use: p.use ?? 'SIGNAL',
        portLayers: Array.from(new Set(p.ports.map(pt => pt.layer ?? '?'))),
      })) : undefined,
    }));
    return NextResponse.json({
      success: true,
      runtimeMs: performance.now() - t0,
      version: lib.version ?? null,
      unitsDbuPerMicron: lib.unitsDbuPerMicron ?? null,
      sites: lib.sites,
      layers: lib.layers,
      macros,
      counts: {
        sites:  lib.sites.length,
        layers: lib.layers.length,
        macros: lib.macros.length,
        warnings: lib.warnings.length,
      },
      warnings: lib.warnings,
    });
  } catch (e) {
    return NextResponse.json(
      { error: 'LEF parse failed', message: e instanceof Error ? e.message : String(e) },
      { status: 400 },
    );
  }
}
