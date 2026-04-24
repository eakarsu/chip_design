/**
 * Bridge between the DEF parser (`src/lib/parsers/def.ts`) and the engine's
 * `Cell` / `Net` types so DEF files can drive the existing flow.
 *
 * - Components → `Cell` (width/height defaulted; real macro sizes live in LEF).
 * - Pins (top-level ports) → `Cell` of type 'io' so they show up as terminals.
 * - Nets → `Net` with materialized pin ids (`<comp>/<pin>`), matching the
 *   convention the Verilog bridge uses.
 *
 * DBU values are converted to micron-floats when a `UNITS DISTANCE MICRONS`
 * line is present, otherwise we keep raw DBU — placement/routing don't care
 * about absolute units, only relative geometry.
 */

import type { Cell, Net } from '@/types/algorithms';
import { parseDef, DefDesign } from '@/lib/parsers/def';

export interface DefBridgeResult {
  designName: string;
  cells: Cell[];
  nets: Net[];
  ioCount: number;
  /** Optional die area as { width, height } in the chosen unit. */
  die?: { width: number; height: number };
  warnings: string[];
}

const DEFAULT_CELL_W = 20;
const DEFAULT_CELL_H = 20;

export function defToEngine(def: DefDesign): DefBridgeResult {
  const scale = def.units?.dbuPerMicron && def.units.dbuPerMicron > 0
    ? 1 / def.units.dbuPerMicron
    : 1;

  // Component cells.
  const cells: Cell[] = def.components.map(c => ({
    id:   c.name,
    name: c.macro,
    width:  DEFAULT_CELL_W,
    height: DEFAULT_CELL_H,
    pins: [],  // populated from net membership below
    type: 'standard',
    position: c.x !== undefined && c.y !== undefined
      ? { x: c.x * scale, y: c.y * scale }
      : undefined,
  }));

  // I/O port "cells" — one per top-level pin so net resolution stays uniform.
  const ioCells: Cell[] = def.pins.map(p => ({
    id: `io_${p.name}`,
    name: p.name,
    width:  DEFAULT_CELL_W,
    height: DEFAULT_CELL_H,
    pins: [{
      id: `io_${p.name}/PAD`,
      name: 'PAD',
      position: { x: 0, y: 0 },
      direction: (p.direction?.toLowerCase() === 'output' ? 'output' : 'input') as 'input' | 'output',
    }],
    type: 'io',
    position: p.x !== undefined && p.y !== undefined
      ? { x: p.x * scale, y: p.y * scale }
      : undefined,
  }));

  // Index for pin id assembly.
  const cellById = new Map<string, Cell>();
  for (const c of cells)   cellById.set(c.id, c);
  for (const c of ioCells) cellById.set(c.id, c);

  // Build pins on the fly from net membership.
  const seenPin = new Set<string>();
  const ensurePin = (cellId: string, pinName: string): string | null => {
    const cell = cellById.get(cellId);
    if (!cell) return null;
    const pinId = `${cellId}/${pinName}`;
    if (!seenPin.has(pinId)) {
      seenPin.add(pinId);
      const dir = /^(Y|Z|Q|OUT|O\d*)$/i.test(pinName) ? 'output' : 'input';
      cell.pins.push({
        id: pinId, name: pinName,
        position: { x: dir === 'input' ? 0 : cell.width, y: cell.height / 2 },
        direction: dir as 'input' | 'output',
      });
    }
    return pinId;
  };

  const nets: Net[] = [];
  for (const dn of def.nets) {
    const pinIds: string[] = [];
    for (const conn of dn.connections) {
      // Top-level "PIN <name>" connections show up with comp === 'PIN'.
      const cellId = conn.component === 'PIN' ? `io_${conn.pin}` : conn.component;
      const pinName = conn.component === 'PIN' ? 'PAD' : conn.pin;
      const pid = ensurePin(cellId, pinName);
      if (pid) pinIds.push(pid);
    }
    if (pinIds.length >= 2) {
      nets.push({ id: dn.name, name: dn.name, pins: pinIds, weight: 1 });
    }
  }

  let die: { width: number; height: number } | undefined;
  if (def.dieArea && def.dieArea.points.length >= 2) {
    const xs = def.dieArea.points.map(p => p.x);
    const ys = def.dieArea.points.map(p => p.y);
    die = {
      width:  (Math.max(...xs) - Math.min(...xs)) * scale,
      height: (Math.max(...ys) - Math.min(...ys)) * scale,
    };
  }

  return {
    designName: def.designName,
    cells: [...cells, ...ioCells],
    nets,
    ioCount: ioCells.length,
    die,
    warnings: def.warnings,
  };
}

/** Convenience: parse + bridge in one call. */
export function parseDefToEngine(src: string): DefBridgeResult {
  return defToEngine(parseDef(src));
}
