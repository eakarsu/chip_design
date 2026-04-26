/**
 * GDS hierarchy analysis.
 *
 * Walk a `GdsLibrary` and:
 *   - find each cell's children (via SREF / AREF) with multiplicities,
 *   - find each cell's parents (the inverse map),
 *   - identify "top" cells — those that are never instantiated by any
 *     other cell (a typical GDS may have multiple tops, e.g. tech-cells),
 *   - compute per-cell stats (element counts by type, bounding box from
 *     boundary points, layers used).
 *
 * The hierarchy is represented as a list of `CellNode` records keyed by
 * cell name. The frontend builds a tree by recursively expanding
 * children from a chosen root.
 */

import type { GdsLibrary, GdsStructure, GdsElement } from '../gds/types';

export interface ChildLink {
  /** Child cell name. */
  name: string;
  /** Total instances (1 for SREF, cols*rows for AREF). */
  count: number;
}

export interface CellStats {
  boundary: number;
  path: number;
  text: number;
  sref: number;
  aref: number;
  /** All element count = sum of the above. */
  total: number;
  /** (layer, datatype) pairs that appear in this cell's geometry. */
  layers: { layer: number; datatype: number }[];
  /** Bounding box in user units (from boundary/path/text points only). null if empty. */
  bbox: { x1: number; y1: number; x2: number; y2: number } | null;
}

export interface CellNode {
  name: string;
  children: ChildLink[];
  parents: string[];
  stats: CellStats;
}

export interface HierarchyResult {
  cells: CellNode[];
  /** Cells that no other cell references (entry points for the tree). */
  tops: string[];
  /** Names that are referenced but missing from the library. */
  unresolved: string[];
}

function statsForCell(s: GdsStructure): CellStats {
  let boundary = 0, path = 0, text = 0, sref = 0, aref = 0;
  const layerSet = new Map<string, { layer: number; datatype: number }>();
  let bx1 = Infinity, by1 = Infinity, bx2 = -Infinity, by2 = -Infinity;
  function expand(x: number, y: number) {
    if (x < bx1) bx1 = x;
    if (x > bx2) bx2 = x;
    if (y < by1) by1 = y;
    if (y > by2) by2 = y;
  }
  for (const el of s.elements) {
    switch (el.type) {
      case 'boundary': {
        boundary++;
        layerSet.set(`${el.layer}/${el.datatype}`, { layer: el.layer, datatype: el.datatype });
        for (const p of el.points) expand(p.x, p.y);
        break;
      }
      case 'path': {
        path++;
        layerSet.set(`${el.layer}/${el.datatype}`, { layer: el.layer, datatype: el.datatype });
        for (const p of el.points) expand(p.x, p.y);
        break;
      }
      case 'text': {
        text++;
        layerSet.set(`${el.layer}/${el.texttype}`, { layer: el.layer, datatype: el.texttype });
        expand(el.origin.x, el.origin.y);
        break;
      }
      case 'sref': sref++; break;
      case 'aref': aref++; break;
    }
  }
  const total = boundary + path + text + sref + aref;
  const bbox = (bx1 === Infinity)
    ? null
    : { x1: bx1, y1: by1, x2: bx2, y2: by2 };
  return {
    boundary, path, text, sref, aref, total,
    layers: [...layerSet.values()].sort((a, b) =>
      a.layer - b.layer || a.datatype - b.datatype,
    ),
    bbox,
  };
}

function childLinks(s: GdsStructure): ChildLink[] {
  const m = new Map<string, number>();
  for (const el of s.elements) {
    if (el.type === 'sref') {
      m.set(el.sname, (m.get(el.sname) ?? 0) + 1);
    } else if (el.type === 'aref') {
      m.set(el.sname, (m.get(el.sname) ?? 0) + el.cols * el.rows);
    }
  }
  return [...m.entries()].map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

export function analyseHierarchy(lib: GdsLibrary): HierarchyResult {
  const allNames = new Set(lib.structures.map(s => s.name));
  const childMap = new Map<string, ChildLink[]>();
  const parentMap = new Map<string, Set<string>>();
  const unresolved = new Set<string>();

  for (const s of lib.structures) {
    const cl = childLinks(s);
    childMap.set(s.name, cl);
    for (const c of cl) {
      if (!allNames.has(c.name)) unresolved.add(c.name);
      else {
        const set = parentMap.get(c.name) ?? new Set();
        set.add(s.name);
        parentMap.set(c.name, set);
      }
    }
  }

  const cells: CellNode[] = lib.structures.map(s => ({
    name: s.name,
    children: childMap.get(s.name) ?? [],
    parents: [...(parentMap.get(s.name) ?? new Set<string>())].sort(),
    stats: statsForCell(s),
  })).sort((a, b) => a.name.localeCompare(b.name));

  const tops = cells.filter(c => c.parents.length === 0).map(c => c.name);

  return {
    cells,
    tops,
    unresolved: [...unresolved].sort(),
  };
}

/**
 * Compute total flattened instance counts per cell — i.e., how many
 * physical copies of cell X exist after fully unrolling the hierarchy
 * starting from `root`. Useful for answering "what's the most-used cell?".
 */
export function flattenCounts(
  hier: HierarchyResult,
  root: string,
): { name: string; count: number }[] {
  const childIdx = new Map<string, ChildLink[]>();
  for (const c of hier.cells) childIdx.set(c.name, c.children);

  const counts = new Map<string, number>();
  const stack: { name: string; mult: number }[] = [{ name: root, mult: 1 }];
  const path = new Set<string>(); // recursion guard
  while (stack.length) {
    const { name, mult } = stack.pop()!;
    counts.set(name, (counts.get(name) ?? 0) + mult);
    if (path.has(name)) continue;
    path.add(name);
    const ch = childIdx.get(name);
    if (!ch) continue;
    for (const c of ch) stack.push({ name: c.name, mult: mult * c.count });
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}
