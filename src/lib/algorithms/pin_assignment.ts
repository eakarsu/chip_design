/**
 * Pin assignment.
 *
 * Given placed cells and a set of nets where some pins are top-level I/O
 * ports (cells of type 'io'), pick a slot on the die boundary for each
 * port that minimizes the total HPWL of the connected nets.
 *
 * Algorithm:
 *   1. Generate `slots` evenly-spaced positions around the die rectangle.
 *   2. For each port, compute its "ideal" location: the centroid of
 *      already-placed (non-port) pins on its incident nets.
 *   3. Sort ports by the strength of their preference (sum of net weights).
 *   4. Greedy assign: each port takes its nearest free slot.
 *
 * Complexity: O((|ports| log |ports|) + |ports| · |slots|). Single-pass
 * greedy isn't optimal — Hungarian assignment would be — but at
 * floorplan scales (a few hundred ports max), the difference is tiny and
 * the greedy is far simpler.
 */

import type { Cell, Net } from '@/types/algorithms';

export interface PinAssignmentInput {
  cells: Cell[];
  nets: Net[];
  chipWidth: number;
  chipHeight: number;
  /** Slots per side. Default 32. */
  slotsPerSide?: number;
}

export interface PinAssignmentResult {
  /** Updated cells (only port cells move). */
  cells: Cell[];
  /** Map of portCellId → assigned position. */
  assignments: { id: string; x: number; y: number; side: 'L' | 'R' | 'T' | 'B' }[];
  hpwlBefore: number;
  hpwlAfter: number;
  runtimeMs: number;
}

interface Slot {
  x: number; y: number;
  side: 'L' | 'R' | 'T' | 'B';
  taken: boolean;
}

function generateSlots(w: number, h: number, perSide: number): Slot[] {
  const slots: Slot[] = [];
  const stepX = w / (perSide + 1);
  const stepY = h / (perSide + 1);
  for (let i = 1; i <= perSide; i++) {
    slots.push({ x: 0,           y: i * stepY, side: 'L', taken: false });
    slots.push({ x: w,           y: i * stepY, side: 'R', taken: false });
    slots.push({ x: i * stepX,   y: 0,         side: 'T', taken: false });
    slots.push({ x: i * stepX,   y: h,         side: 'B', taken: false });
  }
  return slots;
}

function pinCentroid(cell: Cell): { x: number; y: number } | null {
  if (!cell.position) return null;
  return {
    x: cell.position.x + cell.width / 2,
    y: cell.position.y + cell.height / 2,
  };
}

function hpwlOf(net: Net, pinPos: Map<string, { x: number; y: number }>): number {
  const pts = net.pins.map(p => pinPos.get(p)).filter((p): p is { x: number; y: number } => !!p);
  if (pts.length < 2) return 0;
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  return (Math.max(...xs) - Math.min(...xs)) + (Math.max(...ys) - Math.min(...ys));
}

export function assignPins(input: PinAssignmentInput): PinAssignmentResult {
  const t0 = performance.now();
  const slotsPerSide = input.slotsPerSide ?? 32;
  const slots = generateSlots(input.chipWidth, input.chipHeight, slotsPerSide);

  // Index cells.
  const cellById = new Map<string, Cell>();
  for (const c of input.cells) cellById.set(c.id, c);

  // Resolve pin → cell map (each pin id is `${cellId}/...` by convention,
  // but to stay defensive we scan).
  const pinToCell = new Map<string, string>();
  for (const c of input.cells) for (const p of c.pins ?? []) pinToCell.set(p.id, c.id);

  // Pin position lookup.
  const computePinPos = (): Map<string, { x: number; y: number }> => {
    const m = new Map<string, { x: number; y: number }>();
    for (const c of input.cells) {
      const cx = c.position?.x ?? 0;
      const cy = c.position?.y ?? 0;
      for (const p of c.pins ?? []) {
        m.set(p.id, {
          x: cx + (p.position?.x ?? c.width / 2),
          y: cy + (p.position?.y ?? c.height / 2),
        });
      }
    }
    return m;
  };

  const hpwlBefore = (() => {
    const m = computePinPos();
    return input.nets.reduce((s, n) => s + hpwlOf(n, m), 0);
  })();

  // Find ports + their preference signal (centroid of non-port pins on
  // incident nets, weighted by net weight).
  type Pref = { id: string; x: number; y: number; weight: number };
  const prefs = new Map<string, Pref>();
  for (const c of input.cells) {
    if (c.type === 'io') prefs.set(c.id, { id: c.id, x: 0, y: 0, weight: 0 });
  }
  if (prefs.size === 0) {
    return {
      cells: input.cells, assignments: [],
      hpwlBefore, hpwlAfter: hpwlBefore,
      runtimeMs: performance.now() - t0,
    };
  }

  const pinPos = computePinPos();
  for (const net of input.nets) {
    const portPins: string[] = [];
    let sx = 0, sy = 0, n = 0;
    for (const pid of net.pins) {
      const ownerId = pinToCell.get(pid);
      if (!ownerId) continue;
      const owner = cellById.get(ownerId);
      if (!owner) continue;
      if (owner.type === 'io') {
        portPins.push(ownerId);
      } else {
        const pp = pinPos.get(pid);
        if (pp) { sx += pp.x; sy += pp.y; n++; }
      }
    }
    if (portPins.length === 0 || n === 0) continue;
    const cx = sx / n, cy = sy / n;
    const w = net.weight ?? 1;
    for (const pid of portPins) {
      const pref = prefs.get(pid)!;
      pref.x = (pref.x * pref.weight + cx * w) / (pref.weight + w);
      pref.y = (pref.y * pref.weight + cy * w) / (pref.weight + w);
      pref.weight += w;
    }
  }

  // Sort ports by descending weight (strongest preferences placed first).
  const order = [...prefs.values()].sort((a, b) => b.weight - a.weight);

  const assignments: PinAssignmentResult['assignments'] = [];
  for (const pref of order) {
    if (pref.weight === 0) {
      // No preference — drop it on the closest unused slot to chip center.
      pref.x = input.chipWidth / 2;
      pref.y = input.chipHeight / 2;
    }
    let best = -1, bestD = Infinity;
    for (let i = 0; i < slots.length; i++) {
      if (slots[i].taken) continue;
      const dx = slots[i].x - pref.x;
      const dy = slots[i].y - pref.y;
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = i; }
    }
    if (best === -1) break; // out of slots
    slots[best].taken = true;
    const slot = slots[best];
    const cell = cellById.get(pref.id)!;
    cell.position = { x: slot.x - cell.width / 2, y: slot.y - cell.height / 2 };
    assignments.push({ id: pref.id, x: slot.x, y: slot.y, side: slot.side });
  }

  const hpwlAfter = (() => {
    const m = computePinPos();
    return input.nets.reduce((s, n) => s + hpwlOf(n, m), 0);
  })();

  return {
    cells: input.cells,
    assignments,
    hpwlBefore,
    hpwlAfter,
    runtimeMs: performance.now() - t0,
  };
}
