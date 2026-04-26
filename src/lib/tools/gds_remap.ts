/**
 * GDS layer remapping.
 *
 * Apply a layer-mapping table to a `GdsLibrary` — translate (layer, datatype)
 * pairs on every BOUNDARY, PATH, and TEXT element. Cells, references, and
 * geometry are otherwise untouched. Returns a new library plus a `report`
 * that summarises which mappings hit and how many elements fell through.
 *
 * Mapping table semantics:
 *   - Each row may match by layer+datatype (most specific) or layer-only
 *     (matches any datatype). Specific rows win.
 *   - Rows whose `to` is `null` drop the matching elements (filter).
 *   - Rows with no match leave the element unchanged.
 */

import type { GdsLibrary, GdsStructure, GdsElement } from '../gds/types';

export interface RemapRule {
  /** Source layer number. */
  fromLayer: number;
  /** Source datatype/texttype, or `*` to match any. */
  fromDatatype: number | '*';
  /** Destination layer; `null` means drop. */
  toLayer: number | null;
  /** Destination datatype; required iff toLayer != null. */
  toDatatype?: number;
  /** Optional human label for the report. */
  label?: string;
}

export interface RemapTable {
  rules: RemapRule[];
  /** If true, elements that match no rule are dropped. Default false. */
  dropUnmapped?: boolean;
}

export interface RemapReport {
  /** Per-rule hit counts, indexed by rule order. */
  hits: number[];
  /** Elements left unchanged because no rule matched. */
  unmapped: number;
  /** Elements removed (rule with toLayer=null, or unmapped+dropUnmapped). */
  dropped: number;
  /** Total elements processed. */
  total: number;
}

interface LayerKey { l: number; d: number }
function keyOf(el: GdsElement): LayerKey | null {
  switch (el.type) {
    case 'boundary': return { l: el.layer, d: el.datatype };
    case 'path':     return { l: el.layer, d: el.datatype };
    case 'text':     return { l: el.layer, d: el.texttype };
    default:         return null; // sref/aref are layer-less
  }
}

function applyRule(el: GdsElement, rule: RemapRule): GdsElement {
  if (rule.toLayer === null) return el; // caller filters
  const newL = rule.toLayer;
  const newD = rule.toDatatype ?? 0;
  switch (el.type) {
    case 'boundary': return { ...el, layer: newL, datatype: newD };
    case 'path':     return { ...el, layer: newL, datatype: newD };
    case 'text':     return { ...el, layer: newL, texttype: newD };
    default:         return el;
  }
}

function findRule(rules: RemapRule[], k: LayerKey): { rule: RemapRule; idx: number } | null {
  // Specific (layer+datatype) wins over wildcard (layer+'*').
  let wildcard: { rule: RemapRule; idx: number } | null = null;
  for (let i = 0; i < rules.length; i++) {
    const r = rules[i];
    if (r.fromLayer !== k.l) continue;
    if (r.fromDatatype === k.d) return { rule: r, idx: i };
    if (r.fromDatatype === '*' && !wildcard) wildcard = { rule: r, idx: i };
  }
  return wildcard;
}

export function remapLibrary(
  lib: GdsLibrary,
  table: RemapTable,
): { lib: GdsLibrary; report: RemapReport } {
  const hits = new Array(table.rules.length).fill(0);
  let unmapped = 0;
  let dropped = 0;
  let total = 0;

  const newStructs: GdsStructure[] = lib.structures.map(struct => {
    const newEls: GdsElement[] = [];
    for (const el of struct.elements) {
      total++;
      const k = keyOf(el);
      if (!k) { newEls.push(el); continue; }

      const m = findRule(table.rules, k);
      if (!m) {
        if (table.dropUnmapped) dropped++;
        else { unmapped++; newEls.push(el); }
        continue;
      }
      hits[m.idx]++;
      if (m.rule.toLayer === null) { dropped++; continue; }
      newEls.push(applyRule(el, m.rule));
    }
    return { ...struct, elements: newEls };
  });

  return {
    lib: { ...lib, structures: newStructs },
    report: { hits, unmapped, dropped, total },
  };
}

/**
 * Compute a histogram of (layer, datatype) usage across a library — useful
 * for previewing what's actually present before crafting a remap table.
 */
export function layerHistogram(lib: GdsLibrary): {
  layer: number; datatype: number; count: number;
}[] {
  const m = new Map<string, { layer: number; datatype: number; count: number }>();
  for (const s of lib.structures) {
    for (const el of s.elements) {
      const k = keyOf(el);
      if (!k) continue;
      const key = `${k.l}/${k.d}`;
      const e = m.get(key);
      if (e) e.count++;
      else m.set(key, { layer: k.l, datatype: k.d, count: 1 });
    }
  }
  return [...m.values()].sort((a, b) =>
    a.layer - b.layer || a.datatype - b.datatype,
  );
}

/** Parse a JSON config into a typed RemapTable, with validation. */
export function parseRemapTable(json: unknown): RemapTable {
  if (!json || typeof json !== 'object') throw new Error('config must be an object');
  const obj = json as Record<string, unknown>;
  const rawRules = obj.rules;
  if (!Array.isArray(rawRules)) throw new Error('config.rules must be an array');
  const rules: RemapRule[] = rawRules.map((r, i) => {
    if (!r || typeof r !== 'object') throw new Error(`rule ${i} not an object`);
    const o = r as Record<string, unknown>;
    if (typeof o.fromLayer !== 'number') throw new Error(`rule ${i}.fromLayer required`);
    const fromDt = o.fromDatatype;
    if (fromDt !== '*' && typeof fromDt !== 'number') {
      throw new Error(`rule ${i}.fromDatatype must be number or '*'`);
    }
    let toLayer: number | null;
    if (o.toLayer === null) toLayer = null;
    else if (typeof o.toLayer === 'number') toLayer = o.toLayer;
    else throw new Error(`rule ${i}.toLayer must be number or null`);
    if (toLayer !== null && typeof o.toDatatype !== 'number') {
      throw new Error(`rule ${i}.toDatatype required when toLayer is set`);
    }
    return {
      fromLayer: o.fromLayer,
      fromDatatype: fromDt as number | '*',
      toLayer,
      toDatatype: typeof o.toDatatype === 'number' ? o.toDatatype : undefined,
      label: typeof o.label === 'string' ? o.label : undefined,
    };
  });
  return { rules, dropUnmapped: obj.dropUnmapped === true };
}
