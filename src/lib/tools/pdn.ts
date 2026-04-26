/**
 * Power-delivery network (PDN) generator.
 *
 * Given a parametric spec describing the core area and stripe/ring/strap
 * geometry, produce structured shape lists plus a textual DEF SPECIALNETS
 * block that can be merged into a design.
 *
 * The generator targets a conventional two-net VDD/VSS PDN with:
 *   - Outer **rings** on two stacked layers around the core boundary
 *     (one horizontal pair, one vertical pair).
 *   - Vertical **stripes** at fixed pitch on the upper metal.
 *   - Horizontal **straps** at fixed pitch on a lower metal (rail-tie).
 *
 * All coordinates are in microns. The DEF emitter scales by `dbuPerMicron`.
 *
 * This is a deliberately small, deterministic implementation; it does not
 * attempt to skip macros, insert vias, or handle obstructions. Callers can
 * post-process the returned shapes.
 */

export interface Rect {
  net: 'VDD' | 'VSS';
  layer: string;
  /** μm */
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  kind: 'ring' | 'stripe' | 'strap';
}

export interface PdnSpec {
  /** Core/PDN area in microns. */
  core: { x1: number; y1: number; x2: number; y2: number };
  /** Layers used for rings: [horizontal, vertical]. */
  ringLayers: [string, string];
  ringWidth: number;
  /** Inset of the inner ring edge from the core boundary. */
  ringOffset: number;
  /** Layer for vertical stripes (typically upper metal). */
  stripeLayer: string;
  stripeWidth: number;
  stripePitch: number;
  /** Layer for horizontal straps (rail-tie). Optional. */
  strapLayer?: string;
  strapWidth?: number;
  strapPitch?: number;
  /** DBU per micron used by emitDef. Default 1000. */
  dbuPerMicron?: number;
}

export interface PdnResult {
  rings: Rect[];
  stripes: Rect[];
  straps: Rect[];
  metrics: {
    /** Total metal area (μm²) consumed by the PDN. */
    area: number;
    /** Coverage = pdn area / core area. */
    coverage: number;
    rings: number;
    stripes: number;
    straps: number;
  };
}

function rectArea(r: Rect): number {
  return Math.max(0, r.x2 - r.x1) * Math.max(0, r.y2 - r.y1);
}

export function generatePdn(spec: PdnSpec): PdnResult {
  const { core } = spec;
  const w = core.x2 - core.x1;
  const h = core.y2 - core.y1;
  if (w <= 0 || h <= 0) {
    throw new Error('Core area must have positive width and height');
  }
  if (spec.ringWidth <= 0 || spec.stripeWidth <= 0 || spec.stripePitch <= 0) {
    throw new Error('ringWidth, stripeWidth, stripePitch must be positive');
  }

  const rings: Rect[] = [];
  const stripes: Rect[] = [];
  const straps: Rect[] = [];

  const off = spec.ringOffset;
  const rw = spec.ringWidth;
  const [hL, vL] = spec.ringLayers;

  // --- Rings: two pairs (VDD outside, VSS inside) on each layer.
  // Outer ring (VDD) on top, inner ring (VSS) one width inside.
  for (const [idx, net] of (['VDD', 'VSS'] as const).entries()) {
    const inset = off + idx * (rw + 2);
    // Top horizontal
    rings.push({
      net, layer: hL, kind: 'ring',
      x1: core.x1 + inset, y1: core.y2 - inset - rw,
      x2: core.x2 - inset, y2: core.y2 - inset,
    });
    // Bottom horizontal
    rings.push({
      net, layer: hL, kind: 'ring',
      x1: core.x1 + inset, y1: core.y1 + inset,
      x2: core.x2 - inset, y2: core.y1 + inset + rw,
    });
    // Left vertical
    rings.push({
      net, layer: vL, kind: 'ring',
      x1: core.x1 + inset, y1: core.y1 + inset,
      x2: core.x1 + inset + rw, y2: core.y2 - inset,
    });
    // Right vertical
    rings.push({
      net, layer: vL, kind: 'ring',
      x1: core.x2 - inset - rw, y1: core.y1 + inset,
      x2: core.x2 - inset, y2: core.y2 - inset,
    });
  }

  // --- Vertical stripes alternating VDD/VSS at fixed pitch.
  const sw = spec.stripeWidth;
  const sp = spec.stripePitch;
  let i = 0;
  // Start half a pitch in so we don't collide with the ring edge.
  for (let x = core.x1 + sp / 2; x + sw <= core.x2; x += sp) {
    const net: 'VDD' | 'VSS' = i % 2 === 0 ? 'VDD' : 'VSS';
    stripes.push({
      net, layer: spec.stripeLayer, kind: 'stripe',
      x1: x, y1: core.y1, x2: x + sw, y2: core.y2,
    });
    i++;
  }

  // --- Horizontal straps (optional).
  if (spec.strapLayer && spec.strapWidth && spec.strapPitch) {
    const tw = spec.strapWidth;
    const tp = spec.strapPitch;
    let j = 0;
    for (let y = core.y1 + tp / 2; y + tw <= core.y2; y += tp) {
      const net: 'VDD' | 'VSS' = j % 2 === 0 ? 'VDD' : 'VSS';
      straps.push({
        net, layer: spec.strapLayer, kind: 'strap',
        x1: core.x1, y1: y, x2: core.x2, y2: y + tw,
      });
      j++;
    }
  }

  const all = [...rings, ...stripes, ...straps];
  const area = all.reduce((a, r) => a + rectArea(r), 0);
  const coverage = (w * h) > 0 ? area / (w * h) : 0;

  return {
    rings, stripes, straps,
    metrics: {
      area,
      coverage,
      rings: rings.length,
      stripes: stripes.length,
      straps: straps.length,
    },
  };
}

/**
 * Serialise PDN rectangles as a DEF SPECIALNETS block. Coordinates are
 * scaled to DBU. Each shape is emitted as a NEW segment with a RECT.
 */
export function emitDef(result: PdnResult, spec: PdnSpec): string {
  const dbu = spec.dbuPerMicron ?? 1000;
  const all = [...result.rings, ...result.stripes, ...result.straps];

  const byNet: Record<'VDD' | 'VSS', Rect[]> = { VDD: [], VSS: [] };
  for (const r of all) byNet[r.net].push(r);

  const out: string[] = [];
  const nets = (Object.keys(byNet) as Array<'VDD' | 'VSS'>).filter(n => byNet[n].length > 0);
  out.push(`SPECIALNETS ${nets.length} ;`);

  for (const net of nets) {
    const rects = byNet[net];
    out.push(`  - ${net} ( * ${net} )`);
    out.push(`    + USE POWER`);
    const segs: string[] = [];
    for (const r of rects) {
      const x1 = Math.round(r.x1 * dbu);
      const y1 = Math.round(r.y1 * dbu);
      const x2 = Math.round(r.x2 * dbu);
      const y2 = Math.round(r.y2 * dbu);
      const cx = Math.round((x1 + x2) / 2);
      const cy = Math.round((y1 + y2) / 2);
      segs.push(`      + ROUTED ${r.layer} ( ${cx} ${cy} ) RECT ( ${x1 - cx} ${y1 - cy} ${x2 - cx} ${y2 - cy} )`);
    }
    out.push(segs.join('\n'));
    out[out.length - 1] += ' ;';
  }

  out.push('END SPECIALNETS');
  return out.join('\n') + '\n';
}

/** Sample spec used by tests and the UI. */
export function exampleSpec(): PdnSpec {
  return {
    core: { x1: 0, y1: 0, x2: 200, y2: 200 },
    ringLayers: ['M5', 'M6'],
    ringWidth: 4,
    ringOffset: 2,
    stripeLayer: 'M6',
    stripeWidth: 2,
    stripePitch: 30,
    strapLayer: 'M1',
    strapWidth: 0.5,
    strapPitch: 8,
    dbuPerMicron: 1000,
  };
}
