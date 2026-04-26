/**
 * Layer statistics extractor for a FlatLayout.
 *
 * For each (layer, datatype) pair we report the total area, bbox,
 * rect count, polygon count and path count. The page-level "Stats"
 * tab uses this to give designers a quick, at-a-glance view of how
 * much of each layer is in the design — handy for fill-pattern
 * compliance, layer-budget reviews, and synth/P&R diff sanity-checks.
 *
 * Area is computed off the layer's union'd rect set, so rects that
 * overlap aren't double-counted (the flatten step already unionRects).
 */

import { rectsArea, rectsBbox, type Rect } from '@/lib/geometry/polygon';
import type { FlatLayout } from './flatten';

export interface LayerStats {
  layer: number;
  datatype: number;
  rects: number;
  polygons: number;
  paths: number;
  /** Sum of unique rect area in design units. */
  area: number;
  /** Bounding box of all geometry on this layer (null if empty). */
  bbox: Rect | null;
}

export interface LayoutStats {
  topCell: string;
  /** Per-(layer, datatype) breakdown, sorted by layer ID. */
  layers: LayerStats[];
  /** Aggregate counts. */
  totals: {
    rects: number;
    polygons: number;
    paths: number;
    /** Sum of layer areas. Layers overlap each other in 2.5D so this
     *  is the sum, *not* a coverage area — designers expect "metal area"
     *  to mean per-layer summed. */
    summedArea: number;
    layerCount: number;
  };
  /** Joint bbox across every layer. */
  bbox: Rect | null;
}

export function computeLayerStats(layout: FlatLayout): LayoutStats {
  const layers: LayerStats[] = layout.layers.map(l => ({
    layer: l.layer,
    datatype: l.datatype,
    rects: l.rects.length,
    polygons: l.polygons.length,
    paths: l.paths.length,
    area: rectsArea(l.rects),
    bbox: rectsBbox(l.rects),
  })).sort((a, b) => a.layer - b.layer || a.datatype - b.datatype);

  const totals = {
    rects:    layers.reduce((s, l) => s + l.rects, 0),
    polygons: layers.reduce((s, l) => s + l.polygons, 0),
    paths:    layers.reduce((s, l) => s + l.paths, 0),
    summedArea: layers.reduce((s, l) => s + l.area, 0),
    layerCount: layers.length,
  };

  // Joint bbox = bbox over all layer bboxes.
  const bboxes = layers.map(l => l.bbox).filter(Boolean) as Rect[];
  const bbox = bboxes.length ? rectsBbox(bboxes) : null;

  return { topCell: layout.topCell, layers, totals, bbox };
}
