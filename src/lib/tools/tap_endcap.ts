/**
 * Tap-cell + endcap insertion.
 *
 * Walks the standard-cell rows of a floorplan and inserts:
 *
 *   - **endcaps** at the leftmost and rightmost site of each row,
 *   - **tap cells** along the row at a fixed pitch, skipping any site
 *     that overlaps an existing FIXED macro (so we don't drop a tap
 *     into an analog block or a hard macro).
 *
 * The output is a list of new placed components ready to be added to the
 * floorplan (or written to DEF). We never modify the input — the caller
 * decides whether to merge, diff, or just emit.
 *
 * Inputs/outputs are in microns. Site coordinates are quantised to the
 * row's site grid so the inserted cells line up cleanly.
 */

import type { FpMacro, Floorplan } from '../algorithms/floorplan';

export interface TapSpec {
  /** Tap cell master, e.g. "TAPCELL_X1". */
  tapMaster: string;
  /** Endcap cell master, e.g. "ENDCAP_X1". */
  endcapMaster: string;
  /** Centre-to-centre horizontal distance between tap cells (μm). */
  tapPitch: number;
  /** Site width — taps and endcaps snap to this grid. */
  siteWidth: number;
  /** Tap cell footprint width / height (μm). */
  tapWidth: number;
  tapHeight: number;
  /** Endcap footprint (defaults to siteWidth × tapHeight). */
  endcapWidth?: number;
  endcapHeight?: number;
  /** Prefix for inserted instance names. */
  prefix?: string;
}

export interface TapResult {
  /** Newly inserted FIXED components (taps + endcaps). */
  components: FpMacro[];
  /** Per-row counts. */
  perRow: { row: string; taps: number; endcaps: number }[];
  /** Aggregate counts. */
  totalTaps: number;
  totalEndcaps: number;
  warnings: string[];
}

interface Rect { x1: number; y1: number; x2: number; y2: number; }

function macroBox(m: FpMacro): Rect {
  return { x1: m.x, y1: m.y, x2: m.x + m.width, y2: m.y + m.height };
}
function rectsOverlap(a: Rect, b: Rect): boolean {
  return !(a.x2 <= b.x1 || b.x2 <= a.x1 || a.y2 <= b.y1 || b.y2 <= a.y1);
}

export function insertTapsAndEndcaps(fp: Floorplan, spec: TapSpec): TapResult {
  if (spec.tapPitch <= 0) throw new Error('tapPitch must be positive');
  if (spec.siteWidth <= 0) throw new Error('siteWidth must be positive');
  const ew = spec.endcapWidth ?? spec.siteWidth;
  const eh = spec.endcapHeight ?? spec.tapHeight;
  const prefix = spec.prefix ?? 'CTS';

  // Treat every existing FIXED macro as an obstruction.
  const obstacles: Rect[] = fp.macros
    .filter(m => m.fixed)
    .map(macroBox);

  function blocked(r: Rect): boolean {
    for (const o of obstacles) if (rectsOverlap(r, o)) return true;
    return false;
  }

  const out: FpMacro[] = [];
  const perRow: TapResult['perRow'] = [];
  const warnings: string[] = [];
  let totalTaps = 0, totalEndcaps = 0;
  let nextId = 0;

  function name(kind: 'tap' | 'cap'): string {
    const id = nextId++;
    return `${prefix}_${kind}_${id}`;
  }

  for (const row of fp.rows) {
    const rowW = row.numX * row.stepX;
    const rowR: Rect = {
      x1: row.x, y1: row.y,
      x2: row.x + rowW,
      y2: row.y + spec.tapHeight,
    };
    if (rowW <= 0) {
      warnings.push(`row ${row.name} has zero width — skipped`);
      perRow.push({ row: row.name, taps: 0, endcaps: 0 });
      continue;
    }

    let taps = 0, endcaps = 0;
    // Endcap left.
    {
      const r: Rect = { x1: rowR.x1, y1: rowR.y1, x2: rowR.x1 + ew, y2: rowR.y1 + eh };
      if (!blocked(r)) {
        out.push({
          name: name('cap'), master: spec.endcapMaster,
          x: r.x1, y: r.y1, width: ew, height: eh,
          halo: 0, orient: 'N', fixed: true,
        });
        obstacles.push(r);
        endcaps++;
      }
    }
    // Endcap right.
    {
      const r: Rect = { x1: rowR.x2 - ew, y1: rowR.y1, x2: rowR.x2, y2: rowR.y1 + eh };
      if (!blocked(r)) {
        out.push({
          name: name('cap'), master: spec.endcapMaster,
          x: r.x1, y: r.y1, width: ew, height: eh,
          halo: 0, orient: 'FN', fixed: true,
        });
        obstacles.push(r);
        endcaps++;
      }
    }
    // Tap cells along the row at tapPitch, snapped to siteWidth.
    const startX = rowR.x1 + ew + spec.siteWidth;
    const endX   = rowR.x2 - ew - spec.siteWidth;
    if (endX > startX) {
      const snap = (x: number) => Math.round((x - rowR.x1) / spec.siteWidth) * spec.siteWidth + rowR.x1;
      for (let xc = startX + spec.tapPitch / 2; xc + spec.tapWidth <= endX; xc += spec.tapPitch) {
        const x = snap(xc - spec.tapWidth / 2);
        const r: Rect = { x1: x, y1: rowR.y1, x2: x + spec.tapWidth, y2: rowR.y1 + spec.tapHeight };
        if (blocked(r)) continue;
        out.push({
          name: name('tap'), master: spec.tapMaster,
          x: r.x1, y: r.y1, width: spec.tapWidth, height: spec.tapHeight,
          halo: 0, orient: 'N', fixed: true,
        });
        obstacles.push(r);
        taps++;
      }
    }
    perRow.push({ row: row.name, taps, endcaps });
    totalTaps += taps;
    totalEndcaps += endcaps;
  }

  return { components: out, perRow, totalTaps, totalEndcaps, warnings };
}
