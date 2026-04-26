/**
 * Flatten a hierarchical GDSII library into per-(layer, datatype)
 * rectangle sets, resolving SREF/AREF instantiations.
 *
 * The KLayout viewer renders the *flat* layout view by default — every
 * polygon stamped at its absolute (x, y) with all transforms baked in.
 * This module performs that flattening, plus a layer/datatype index so
 * the layer panel can toggle visibility cheaply.
 *
 * Recursion is bounded by `maxDepth` (default 50) to defend against
 * circular cell references (which a malformed GDS could embed).
 */

import type {
  GdsLibrary, GdsStructure, GdsTransform, GdsPoint,
  GdsBoundary, GdsPath, GdsSRef, GdsARef,
} from '@/lib/gds/types';
import { polygonsToRects, unionRects, type Rect, type Polygon } from '@/lib/geometry/polygon';

export interface FlatLayer {
  layer: number;
  datatype: number;
  rects: Rect[];
  /** Untransformed polygon contours preserved for non-Manhattan shapes
   *  the viewer wants to render exactly. */
  polygons: Polygon[];
  /** Path centerlines + width (kept separate so the renderer can stroke
   *  them without exploding to rectangles for big designs). */
  paths: { points: Polygon; width: number }[];
}

export interface FlatLayout {
  /** The structure that was flattened (the user picks the top cell). */
  topCell: string;
  /** Bounding box of all flattened geometry. */
  bbox: Rect | null;
  /** One entry per unique (layer, datatype) tuple, layer-major sorted. */
  layers: FlatLayer[];
  /** Total polygon count (boundaries + paths after flatten). */
  shapeCount: number;
}

/** Public entry. */
export function flattenLibrary(
  lib: GdsLibrary,
  topCellName?: string,
  opts: { maxDepth?: number } = {},
): FlatLayout {
  const top = pickTop(lib, topCellName);
  const acc = new Map<string, FlatLayer>();
  let shapes = 0;

  if (top) {
    const byName = new Map(lib.structures.map(s => [s.name, s]));
    flatten(byName, top, identityTx(), 0, opts.maxDepth ?? 50, acc, () => { shapes++; });
  }

  const layers = Array.from(acc.values()).map(l => ({ ...l, rects: unionRects(l.rects) }));
  layers.sort((a, b) => a.layer - b.layer || a.datatype - b.datatype);

  const allRects = layers.flatMap(l => l.rects);
  const bbox = allRects.length === 0
    ? null
    : allRects.reduce<Rect>((acc, r) => ({
        xl: Math.min(acc.xl, r.xl), yl: Math.min(acc.yl, r.yl),
        xh: Math.max(acc.xh, r.xh), yh: Math.max(acc.yh, r.yh),
      }), { xl: Infinity, yl: Infinity, xh: -Infinity, yh: -Infinity });

  return { topCell: top?.name ?? '', bbox, layers, shapeCount: shapes };
}

/** Composite affine transform for SREF/AREF. */
interface Tx {
  a: number; b: number; // x' = a*x + b*y + tx
  c: number; d: number; // y' = c*x + d*y + ty
  tx: number; ty: number;
}

const identityTx = (): Tx => ({ a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 });

function applyTx(tx: Tx, p: GdsPoint): GdsPoint {
  return {
    x: tx.a * p.x + tx.b * p.y + tx.tx,
    y: tx.c * p.x + tx.d * p.y + tx.ty,
  };
}

function compose(outer: Tx, inner: Tx): Tx {
  return {
    a: outer.a * inner.a + outer.b * inner.c,
    b: outer.a * inner.b + outer.b * inner.d,
    c: outer.c * inner.a + outer.d * inner.c,
    d: outer.c * inner.b + outer.d * inner.d,
    tx: outer.a * inner.tx + outer.b * inner.ty + outer.tx,
    ty: outer.c * inner.tx + outer.d * inner.ty + outer.ty,
  };
}

/** SREF/AREF transforms compose: optional reflectX, then mag, then rotate,
 *  then translate by origin. Matches GDSII/KLayout semantics. */
function buildLocalTx(origin: GdsPoint, t?: GdsTransform): Tx {
  const mag = t?.mag ?? 1;
  const ang = ((t?.angleDeg ?? 0) * Math.PI) / 180;
  const cs = Math.cos(ang) * mag;
  const sn = Math.sin(ang) * mag;
  // Reflection about X (negate y) — applied *before* rotation.
  const ry = t?.reflectX ? -1 : 1;
  return {
    a: cs,        b: -sn * ry,
    c: sn,        d:  cs * ry,
    tx: origin.x, ty: origin.y,
  };
}

function pickTop(lib: GdsLibrary, name?: string): GdsStructure | undefined {
  if (lib.structures.length === 0) return undefined;
  if (name) {
    const s = lib.structures.find(s => s.name === name);
    if (s) return s;
  }
  // Default: the structure that no SREF/AREF references — i.e., a root.
  // If multiple, pick the one with the most elements (largest by content).
  const referenced = new Set<string>();
  for (const s of lib.structures) {
    for (const e of s.elements) {
      if (e.type === 'sref' || e.type === 'aref') referenced.add(e.sname);
    }
  }
  const roots = lib.structures.filter(s => !referenced.has(s.name));
  const candidates = roots.length > 0 ? roots : lib.structures;
  return candidates.sort((a, b) => b.elements.length - a.elements.length)[0];
}

function flatten(
  byName: Map<string, GdsStructure>,
  cell: GdsStructure,
  tx: Tx,
  depth: number,
  maxDepth: number,
  acc: Map<string, FlatLayer>,
  onShape: () => void,
): void {
  if (depth > maxDepth) return;
  for (const e of cell.elements) {
    if (e.type === 'boundary') emitBoundary(e, tx, acc, onShape);
    else if (e.type === 'path') emitPath(e, tx, acc, onShape);
    else if (e.type === 'sref') {
      const child = byName.get(e.sname);
      if (!child) continue;
      const local = buildLocalTx(e.origin, e.transform);
      flatten(byName, child, compose(tx, local), depth + 1, maxDepth, acc, onShape);
    } else if (e.type === 'aref') {
      const child = byName.get(e.sname);
      if (!child) continue;
      // AREF: stamp the child at every (col, row) offset.
      for (let r = 0; r < e.rows; r++) {
        for (let c = 0; c < e.cols; c++) {
          const origin: GdsPoint = {
            x: e.origin.x + c * e.colVector.x + r * e.rowVector.x,
            y: e.origin.y + c * e.colVector.y + r * e.rowVector.y,
          };
          const local = buildLocalTx(origin, e.transform);
          flatten(byName, child, compose(tx, local), depth + 1, maxDepth, acc, onShape);
        }
      }
    }
    // TEXT records are ignored at flatten time — the viewer handles them
    // separately so labels don't get baked into geometry layers.
  }
}

function getLayer(acc: Map<string, FlatLayer>, layer: number, datatype: number): FlatLayer {
  const key = `${layer}/${datatype}`;
  let entry = acc.get(key);
  if (!entry) {
    entry = { layer, datatype, rects: [], polygons: [], paths: [] };
    acc.set(key, entry);
  }
  return entry;
}

function emitBoundary(
  e: GdsBoundary, tx: Tx,
  acc: Map<string, FlatLayer>, onShape: () => void,
): void {
  if (e.points.length < 3) return;
  const xform = e.points.map(p => applyTx(tx, p));
  // Drop trailing-equal closing vertex for the polygon set, then derive
  // rects via the boolean engine (Manhattan path) or a bbox fallback.
  const ring = stripClosing(xform);
  const layer = getLayer(acc, e.layer, e.datatype);
  layer.polygons.push(ring);
  layer.rects.push(...polygonsToRects([ring]));
  onShape();
}

function emitPath(
  e: GdsPath, tx: Tx,
  acc: Map<string, FlatLayer>, onShape: () => void,
): void {
  if (e.points.length < 2) return;
  const xform = e.points.map(p => applyTx(tx, p));
  const layer = getLayer(acc, e.layer, e.datatype);
  layer.paths.push({ points: xform, width: Math.abs(e.width) });
  onShape();
}

function stripClosing(p: Polygon): Polygon {
  if (p.length < 2) return p;
  const a = p[0], b = p[p.length - 1];
  return a.x === b.x && a.y === b.y ? p.slice(0, -1) : p;
}

// ---------------------------------------------------------------------------
// Cell hierarchy
// ---------------------------------------------------------------------------

export interface CellHierarchyNode {
  /** Cell name. May appear multiple times in the tree (different parents). */
  name: string;
  /** Stable path key from root: e.g. "TOP/CONTACT#0/VIA_C#1". */
  path: string;
  /** SREF=1, AREF=cols*rows, root=1. */
  instanceCount: number;
  /** True when this cell would create a cycle (already on the ancestor stack). */
  cyclic: boolean;
  /** Number of geometry elements (boundary/path/text) in the cell itself. */
  ownShapes: number;
  children: CellHierarchyNode[];
}

/**
 * Build the hierarchical cell tree starting at the chosen top cell.
 *
 * KLayout's "Cells" panel shows this same view: a tree where each node is
 * a sub-cell instance and the leaves are cells with no SREF/AREF. We mark
 * cycles defensively rather than recursing forever.
 */
export function buildCellHierarchy(
  lib: GdsLibrary,
  topCellName?: string,
  opts: { maxDepth?: number } = {},
): CellHierarchyNode | null {
  const top = pickTop(lib, topCellName);
  if (!top) return null;
  const byName = new Map(lib.structures.map(s => [s.name, s]));
  return buildNode(byName, top, [top.name], opts.maxDepth ?? 50, 0, 1, top.name);
}

function buildNode(
  byName: Map<string, GdsStructure>,
  cell: GdsStructure,
  ancestors: string[],
  maxDepth: number,
  depth: number,
  instanceCount: number,
  pathKey: string,
): CellHierarchyNode {
  const ownShapes = cell.elements.filter(e =>
    e.type === 'boundary' || e.type === 'path' || e.type === 'text',
  ).length;

  const children: CellHierarchyNode[] = [];

  if (depth < maxDepth) {
    let idx = 0;
    for (const e of cell.elements) {
      if (e.type !== 'sref' && e.type !== 'aref') continue;
      const childCell = byName.get(e.sname);
      const cyclic = ancestors.includes(e.sname);
      const childPath = `${pathKey}/${e.sname}#${idx++}`;
      const ic = e.type === 'aref' ? e.cols * e.rows : 1;
      if (!childCell) {
        // Reference to a missing cell — surface it as a stub leaf.
        children.push({
          name: e.sname, path: childPath, instanceCount: ic,
          cyclic: false, ownShapes: 0, children: [],
        });
        continue;
      }
      if (cyclic) {
        children.push({
          name: e.sname, path: childPath, instanceCount: ic,
          cyclic: true, ownShapes: 0, children: [],
        });
        continue;
      }
      children.push(
        buildNode(
          byName, childCell,
          [...ancestors, e.sname],
          maxDepth, depth + 1, ic, childPath,
        ),
      );
    }
  }

  return {
    name: cell.name,
    path: pathKey,
    instanceCount,
    cyclic: false,
    ownShapes,
    children,
  };
}
