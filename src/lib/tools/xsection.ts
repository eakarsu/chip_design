/**
 * Cross-section extractor.
 *
 * KLayout's signature view: take a layer stack-up (z-position + thickness
 * for each layer) and a 2D layout (rectangles tagged with a layer name),
 * and intersect with a horizontal or vertical cut line. The result is a
 * list of vertical slabs — one per layer per intersected rect — that the
 * UI can render as a fab-style cross section.
 *
 * Inputs/outputs are in microns. The cut line is described by an axis
 * ('x' or 'y') and a coordinate; we intersect by clipping each rect against
 * the cut and projecting it onto the section axis (x for an 'x'-cut means
 * the cut runs at constant y, so we project onto x).
 */

export interface LayerStackEntry {
  /** Layer name. */
  name: string;
  /** Bottom z (μm). */
  z: number;
  /** Layer thickness (μm). z + thickness = top. */
  thickness: number;
  /** Optional fill colour for rendering. */
  color?: string;
  /** Optional kind classification — purely cosmetic. */
  kind?: 'metal' | 'via' | 'poly' | 'diff' | 'sub' | 'other';
}

export interface LayerRect {
  layer: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface XSectionRequest {
  stack: LayerStackEntry[];
  rects: LayerRect[];
  /** Cut along constant-y line (axis='x') or constant-x line (axis='y'). */
  axis: 'x' | 'y';
  /** Coordinate of the cut line. */
  at: number;
  /** Optional clipping window along the section axis. */
  windowMin?: number;
  windowMax?: number;
}

export interface XSectionSlab {
  layer: string;
  /** Section-axis position (μm). */
  s1: number;
  s2: number;
  /** Vertical position (μm). */
  z1: number;
  z2: number;
  color?: string;
  kind?: LayerStackEntry['kind'];
}

export interface XSectionResult {
  slabs: XSectionSlab[];
  /** Bounding box of the resulting section, useful for the canvas. */
  sMin: number;
  sMax: number;
  zMin: number;
  zMax: number;
  /** Layers present in the cut, in z-order. */
  layersHit: string[];
  warnings: string[];
}

export function extractXSection(req: XSectionRequest): XSectionResult {
  if (!Array.isArray(req.stack) || req.stack.length === 0) {
    throw new Error('stack must be a non-empty array');
  }
  if (!Array.isArray(req.rects)) {
    throw new Error('rects must be an array');
  }
  if (req.axis !== 'x' && req.axis !== 'y') {
    throw new Error('axis must be "x" or "y"');
  }

  const stackByName = new Map<string, LayerStackEntry>();
  for (const s of req.stack) stackByName.set(s.name, s);

  const slabs: XSectionSlab[] = [];
  const warnings: string[] = [];
  const hits = new Set<string>();

  for (const r of req.rects) {
    const layer = stackByName.get(r.layer);
    if (!layer) {
      warnings.push(`rect on unknown layer "${r.layer}" — skipped`);
      continue;
    }
    // Does the cut hit this rect?
    if (req.axis === 'x') {
      // Cut is the line y = req.at. Need r.y <= at <= r.y + h.
      if (req.at < r.y || req.at > r.y + r.height) continue;
      slabs.push({
        layer: r.layer,
        s1: r.x, s2: r.x + r.width,
        z1: layer.z, z2: layer.z + layer.thickness,
        color: layer.color, kind: layer.kind,
      });
    } else {
      if (req.at < r.x || req.at > r.x + r.width) continue;
      slabs.push({
        layer: r.layer,
        s1: r.y, s2: r.y + r.height,
        z1: layer.z, z2: layer.z + layer.thickness,
        color: layer.color, kind: layer.kind,
      });
    }
    hits.add(r.layer);
  }

  // Apply optional window.
  let filtered = slabs;
  if (req.windowMin != null || req.windowMax != null) {
    const lo = req.windowMin ?? -Infinity;
    const hi = req.windowMax ?? +Infinity;
    filtered = slabs
      .map(s => ({ ...s, s1: Math.max(lo, s.s1), s2: Math.min(hi, s.s2) }))
      .filter(s => s.s2 > s.s1);
  }

  // Compute bounding box.
  let sMin = Infinity, sMax = -Infinity, zMin = Infinity, zMax = -Infinity;
  for (const s of filtered) {
    if (s.s1 < sMin) sMin = s.s1;
    if (s.s2 > sMax) sMax = s.s2;
    if (s.z1 < zMin) zMin = s.z1;
    if (s.z2 > zMax) zMax = s.z2;
  }
  if (filtered.length === 0) {
    sMin = req.windowMin ?? 0;
    sMax = req.windowMax ?? 1;
    zMin = Math.min(...req.stack.map(l => l.z));
    zMax = Math.max(...req.stack.map(l => l.z + l.thickness));
  }

  // Layers hit, in stack z-order.
  const layersHit = Array.from(hits).sort((a, b) => {
    const sa = stackByName.get(a)!;
    const sb = stackByName.get(b)!;
    return sa.z - sb.z;
  });

  return { slabs: filtered, sMin, sMax, zMin, zMax, layersHit, warnings };
}

/**
 * A reasonable default stack-up for demo purposes, modelled on a generic
 * 6-metal CMOS BEOL.
 */
export function defaultStackup(): LayerStackEntry[] {
  return [
    { name: 'sub',  z: -2,    thickness: 2,    color: '#9ca3af', kind: 'sub' },
    { name: 'diff', z:  0,    thickness: 0.15, color: '#f59e0b', kind: 'diff' },
    { name: 'poly', z:  0.15, thickness: 0.18, color: '#dc2626', kind: 'poly' },
    { name: 'M1',   z:  0.45, thickness: 0.25, color: '#2563eb', kind: 'metal' },
    { name: 'V1',   z:  0.70, thickness: 0.25, color: '#1e40af', kind: 'via' },
    { name: 'M2',   z:  0.95, thickness: 0.30, color: '#0891b2', kind: 'metal' },
    { name: 'V2',   z:  1.25, thickness: 0.25, color: '#155e75', kind: 'via' },
    { name: 'M3',   z:  1.50, thickness: 0.30, color: '#16a34a', kind: 'metal' },
    { name: 'V3',   z:  1.80, thickness: 0.25, color: '#166534', kind: 'via' },
    { name: 'M4',   z:  2.05, thickness: 0.40, color: '#a16207', kind: 'metal' },
    { name: 'V4',   z:  2.45, thickness: 0.30, color: '#854d0e', kind: 'via' },
    { name: 'M5',   z:  2.75, thickness: 0.50, color: '#9333ea', kind: 'metal' },
    { name: 'V5',   z:  3.25, thickness: 0.30, color: '#6b21a8', kind: 'via' },
    { name: 'M6',   z:  3.55, thickness: 0.80, color: '#db2777', kind: 'metal' },
  ];
}
