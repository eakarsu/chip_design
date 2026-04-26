/**
 * DEF + LEF → FlatLayout adapter.
 *
 * The KLayout viewer renders FlatLayout, which is the natural output of
 * GDSII flattening. To reuse the same canvas for OpenROAD-style designs we
 * synthesise a FlatLayout from a DEF placement file plus the LEF macro
 * library: one rectangle per macro outline (per placed instance), plus
 * each pin/obstruction rect transformed into chip coordinates.
 *
 * LEF/DEF orientation codes follow the Cadence spec:
 *
 *   N  identity                    FN  flip-Y
 *   S  rot180                      FS  flip-X
 *   E  rot90-CCW    (W,H → H,W)    FE  flip-Y then rot90-CCW
 *   W  rot270-CCW   (W,H → H,W)    FW  flip-X then rot90-CCW
 *
 * LEF layer names are mapped to numeric layer IDs in order of first
 * appearance — stable enough for visualisation, and the .lyp file (if
 * loaded) will key off the same numbers via `defaultLypEntry`.
 */

import type { LefLibrary, LefMacro, Rect as LefRect } from '@/lib/parsers/lef';
import type { DefDesign, DefComponent } from '@/lib/parsers/def';
import type { FlatLayout, FlatLayer } from '@/lib/klayout/flatten';
import { unionRects, type Rect } from '@/lib/geometry/polygon';

/** Synthetic layer used for cell outlines (drawn so users see the placement). */
export const OUTLINE_LAYER = 100;
export const OUTLINE_DATATYPE = 0;

export interface DefToFlatResult extends FlatLayout {
  /** LEF layer name → numeric layer id used in the FlatLayout. */
  layerMap: Map<string, number>;
  /** netId → all chip-space rects that participate in that net. Used by the
   *  KLayout-style net-highlight tool. Empty when the DEF has no nets. */
  netIndex: Map<string, Rect[]>;
  /** componentInstance → bounding rect. Used by the picker to click
   *  a component and find its nets. */
  cellBboxes: Map<string, Rect>;
}

export function defToFlat(def: DefDesign, lef: LefLibrary): DefToFlatResult {
  const dbu = def.units?.dbuPerMicron ?? 1;
  const macroByName = new Map(lef.macros.map(m => [m.name, m]));

  // Allocate numeric layer IDs as we encounter LEF layer names.
  const layerMap = new Map<string, number>();
  function layerId(name: string): number {
    if (!layerMap.has(name)) layerMap.set(name, 200 + layerMap.size);
    return layerMap.get(name)!;
  }

  // Bucket of (layerId, datatype) → Rect[].
  const rectBuckets = new Map<string, { layer: number; datatype: number; rects: Rect[] }>();
  function addRect(layer: number, r: Rect): void {
    const k = `${layer}/0`;
    let entry = rectBuckets.get(k);
    if (!entry) { entry = { layer, datatype: 0, rects: [] }; rectBuckets.set(k, entry); }
    entry.rects.push(r);
  }

  let shapes = 0;

  // Build (component, pin) → netId from DEF NETS for fast lookup while
  // emitting macro pin rects.
  const pinToNet = new Map<string, string>(); // key = "comp\0pin"
  for (const n of def.nets) {
    for (const conn of n.connections) {
      pinToNet.set(`${conn.component}\u0000${conn.pin}`, n.name);
    }
  }
  const netIndex = new Map<string, Rect[]>();
  const cellBboxes = new Map<string, Rect>();

  for (const c of def.components) {
    const macro = macroByName.get(c.macro);
    if (!macro) continue;
    if (c.x == null || c.y == null) continue;
    const px = c.x / dbu;
    const py = c.y / dbu;
    const orient = (c.orient ?? 'N').toUpperCase();

    // Outline of the macro after orient (rotated dimensions for E/W/FE/FW).
    const { width: W, height: H } = orientedSize(macro, orient);
    const cellBox: Rect = { xl: px, yl: py, xh: px + W, yh: py + H };
    addRect(OUTLINE_LAYER, cellBox);
    cellBboxes.set(c.name, cellBox);
    shapes++;

    // Pin port rects — one shape per LEF rect, on the LEF-named layer.
    for (const pin of macro.pins) {
      const netId = pinToNet.get(`${c.name}\u0000${pin.name}`);
      for (const port of pin.ports) {
        if (!port.layer) continue;
        const lid = layerId(port.layer);
        for (const r of port.rects) {
          const t = transformRect(r, macro.size, orient);
          const chipR: Rect = { xl: px + t.xl, yl: py + t.yl, xh: px + t.xh, yh: py + t.yh };
          addRect(lid, chipR);
          if (netId) {
            const arr = netIndex.get(netId) ?? [];
            arr.push(chipR);
            netIndex.set(netId, arr);
          }
          shapes++;
        }
      }
    }

    // Obstructions ("OBS" in LEF) — drawn on the same layer as the obstacle.
    for (const obs of macro.obstructions) {
      const lid = layerId(obs.layer);
      for (const r of obs.rects) {
        const t = transformRect(r, macro.size, orient);
        addRect(lid, { xl: px + t.xl, yl: py + t.yl, xh: px + t.xh, yh: py + t.yh });
        shapes++;
      }
    }
  }

  // Union per layer for clean rendering and a tighter rect count.
  const layers: FlatLayer[] = Array.from(rectBuckets.values()).map(b => ({
    layer: b.layer,
    datatype: b.datatype,
    rects: unionRects(b.rects),
    polygons: [],
    paths: [],
  }));
  layers.sort((a, b) => a.layer - b.layer || a.datatype - b.datatype);

  // Bbox: prefer DEF DIEAREA when present, else union of all rects.
  let bbox: Rect | null = null;
  if (def.dieArea?.points && def.dieArea.points.length >= 2) {
    const pts = def.dieArea.points;
    const xs = pts.map(p => p.x / dbu);
    const ys = pts.map(p => p.y / dbu);
    bbox = {
      xl: Math.min(...xs), yl: Math.min(...ys),
      xh: Math.max(...xs), yh: Math.max(...ys),
    };
  } else {
    const all = layers.flatMap(l => l.rects);
    if (all.length) {
      bbox = all.reduce<Rect>((acc, r) => ({
        xl: Math.min(acc.xl, r.xl), yl: Math.min(acc.yl, r.yl),
        xh: Math.max(acc.xh, r.xh), yh: Math.max(acc.yh, r.yh),
      }), { xl: Infinity, yl: Infinity, xh: -Infinity, yh: -Infinity });
    }
  }

  return {
    topCell: def.designName ?? 'TOP',
    bbox,
    layers,
    shapeCount: shapes,
    layerMap,
    netIndex,
    cellBboxes,
  };
}

/** Find the net (if any) whose pin-rects contain the given chip-space point. */
export function pickNetAt(
  result: DefToFlatResult,
  x: number, y: number,
): string | null {
  for (const [netId, rects] of result.netIndex) {
    for (const r of rects) {
      if (x >= r.xl && x <= r.xh && y >= r.yl && y <= r.yh) return netId;
    }
  }
  return null;
}

/** Find the component instance under a chip-space point. */
export function pickCellAt(
  result: DefToFlatResult,
  x: number, y: number,
): string | null {
  for (const [cellId, r] of result.cellBboxes) {
    if (x >= r.xl && x <= r.xh && y >= r.yl && y <= r.yh) return cellId;
  }
  return null;
}

/** Return the macro footprint after applying `orient`. */
function orientedSize(macro: LefMacro, orient: string): { width: number; height: number } {
  const { width, height } = macro.size;
  if (orient === 'E' || orient === 'W' || orient === 'FE' || orient === 'FW') {
    return { width: height, height: width };
  }
  return { width, height };
}

/**
 * Apply DEF orient to a rect specified in macro-local coordinates. Returns
 * a rect in oriented-macro space (still relative to the macro origin —
 * caller adds the placement offset).
 */
function transformRect(r: LefRect, size: { width: number; height: number }, orient: string): Rect {
  const W = size.width, H = size.height;
  const corners = [
    { x: r.xl, y: r.yl }, { x: r.xh, y: r.yl },
    { x: r.xh, y: r.yh }, { x: r.xl, y: r.yh },
  ];
  const t = corners.map(p => orientPoint(p, W, H, orient));
  const xs = t.map(p => p.x);
  const ys = t.map(p => p.y);
  return {
    xl: Math.min(...xs), yl: Math.min(...ys),
    xh: Math.max(...xs), yh: Math.max(...ys),
  };
}

function orientPoint(p: { x: number; y: number }, W: number, H: number, orient: string): { x: number; y: number } {
  switch (orient) {
    case 'N':  return { x: p.x,         y: p.y };
    case 'S':  return { x: W - p.x,     y: H - p.y };
    case 'E':  return { x: H - p.y,     y: p.x };       // rot 90 CCW
    case 'W':  return { x: p.y,         y: W - p.x };   // rot 270 CCW
    case 'FN': return { x: W - p.x,     y: p.y };       // flip-Y
    case 'FS': return { x: p.x,         y: H - p.y };   // flip-X
    case 'FE': return { x: H - p.y,     y: W - p.x };   // FN + rot90
    case 'FW': return { x: p.y,         y: p.x };       // FS + rot90
    default:   return { x: p.x,         y: p.y };
  }
}
