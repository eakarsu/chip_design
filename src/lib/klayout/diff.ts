/**
 * Layout diff — compare two FlatLayouts layer-by-layer.
 *
 * For each (layer, datatype) tuple that appears in either input we compute:
 *   - common  = A ∩ B    (geometry present in both)
 *   - added   = B \ A    (only in B — newly drawn)
 *   - removed = A \ B    (only in A — deleted in B)
 *
 * The result is a per-layer record plus a top-line summary of total area
 * changed. Useful for comparing two GDS revisions / pre-vs-post-DRC fixes
 * / synthesis vs. P&R results.
 *
 * All inputs go through the rectilinear boolean engine in
 * `lib/geometry/polygon`, which is a superset for arbitrary 45° polygons
 * (it bbox-approximates them — same caveat as the layout viewer).
 */

import { boolRects, rectsArea, rectsBbox, type Rect } from '@/lib/geometry/polygon';
import type { FlatLayout, FlatLayer } from './flatten';

export interface DiffLayer {
  layer: number;
  datatype: number;
  added:   Rect[];   // in B not A
  removed: Rect[];   // in A not B
  common:  Rect[];   // intersection
  /** Quick numeric summary in DBU². */
  addedArea:   number;
  removedArea: number;
  commonArea:  number;
}

export interface LayoutDiff {
  layers: DiffLayer[];
  /** Joint bbox of A and B. null if both inputs are empty. */
  bbox: Rect | null;
  /** Sum of added/removed/common across layers (DBU²). */
  totals: { added: number; removed: number; common: number };
  /** Layers in A but with zero shapes in B (or vice versa) — convenience. */
  layersOnlyInA: { layer: number; datatype: number }[];
  layersOnlyInB: { layer: number; datatype: number }[];
}

/**
 * Diff two flat layouts. The two inputs need not share the same layer
 * sets — missing layers are treated as empty rect sets in the boolean
 * operations.
 */
export function diffLayouts(a: FlatLayout, b: FlatLayout): LayoutDiff {
  const keyOf = (l: { layer: number; datatype: number }) => `${l.layer}:${l.datatype}`;
  const aMap = new Map<string, FlatLayer>(a.layers.map(l => [keyOf(l), l]));
  const bMap = new Map<string, FlatLayer>(b.layers.map(l => [keyOf(l), l]));

  const allKeys = new Set<string>([...aMap.keys(), ...bMap.keys()]);
  const layers: DiffLayer[] = [];
  const layersOnlyInA: { layer: number; datatype: number }[] = [];
  const layersOnlyInB: { layer: number; datatype: number }[] = [];
  let totalAdded = 0, totalRemoved = 0, totalCommon = 0;

  for (const k of allKeys) {
    const la = aMap.get(k);
    const lb = bMap.get(k);
    const aRects = la?.rects ?? [];
    const bRects = lb?.rects ?? [];

    const added   = boolRects(bRects, aRects, 'NOT');     // B \ A
    const removed = boolRects(aRects, bRects, 'NOT');     // A \ B
    const common  = boolRects(aRects, bRects, 'AND');

    const addedArea   = rectsArea(added);
    const removedArea = rectsArea(removed);
    const commonArea  = rectsArea(common);

    if (la && !lb && bRects.length === 0) layersOnlyInA.push({ layer: la.layer, datatype: la.datatype });
    if (lb && !la && aRects.length === 0) layersOnlyInB.push({ layer: lb.layer, datatype: lb.datatype });

    const [layerNum, datatypeNum] = k.split(':').map(Number);
    layers.push({
      layer: layerNum, datatype: datatypeNum,
      added, removed, common, addedArea, removedArea, commonArea,
    });

    totalAdded   += addedArea;
    totalRemoved += removedArea;
    totalCommon  += commonArea;
  }

  layers.sort((x, y) => x.layer - y.layer || x.datatype - y.datatype);

  const bboxes = [a.bbox, b.bbox].filter(Boolean) as Rect[];
  const bbox = bboxes.length ? rectsBbox(bboxes) : null;

  return {
    layers,
    bbox,
    totals: { added: totalAdded, removed: totalRemoved, common: totalCommon },
    layersOnlyInA,
    layersOnlyInB,
  };
}
