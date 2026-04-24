/**
 * Engineering Change Order (ECO) flow.
 *
 * After PnR has run end-to-end, we sometimes need to make small, surgical
 * changes — fix a timing path, swap a leaky cell, drop in a buffer to break
 * a long high-fanout net — *without* re-running the whole flow. That's an
 * ECO. This module is the in-memory engine that:
 *
 *   1. Accepts a list of `EcoOperation`s (cell swap, buffer insert, gate
 *      resize, pin swap, cell move).
 *   2. Applies them to a `DesignSnapshot` in order, returning the new
 *      snapshot plus a per-operation status report.
 *   3. Validates legality — no orphan pins, no duplicate IDs, no shorts.
 *
 * The output is consumed by the UI (to show "what would change" before
 * commit), the bridge (to ship the diff to the Python service for an
 * incremental analysis), and the persistence layer.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

import type { DesignSnapshot } from '@/lib/bridge/design_state';
import { diffSnapshots, type SnapshotDiff } from '@/lib/bridge/design_state';
import type { Cell, Net, Pin } from '@/types/algorithms';

/* --------------------------------------------------------------------- */
/* Operation discriminated union                                           */
/* --------------------------------------------------------------------- */

export type EcoOperation =
  | EcoCellSwap
  | EcoBufferInsert
  | EcoGateResize
  | EcoPinSwap
  | EcoCellMove;

/** Replace a cell's underlying library type, keeping its id and pins. */
export interface EcoCellSwap {
  kind: 'cell_swap';
  cellId: string;
  newName: string;
  newWidth?: number;
  newHeight?: number;
  reason?: string;
}

/** Insert a buffer cell on a net, splitting the net into driver→buf, buf→sinks. */
export interface EcoBufferInsert {
  kind: 'buffer_insert';
  netId: string;
  /** New cell + position. The buffer cell must have exactly one input + one output pin. */
  buffer: Cell;
  /** Pin id on the new buffer that drives the downstream net. */
  bufferOutputPinId: string;
  /** Pin id on the new buffer that connects to the original driver. */
  bufferInputPinId: string;
  reason?: string;
}

/** Bump a cell's drive strength. Just a width/height resize plus name suffix. */
export interface EcoGateResize {
  kind: 'gate_resize';
  cellId: string;
  scaleFactor: number; // 1.5x, 2x, etc. Applied to width.
  reason?: string;
}

/**
 * Swap two pins on a commutative gate (e.g. AND/OR inputs). Operates at
 * the net level: any net referencing pinA is rewritten to reference pinB,
 * and vice-versa.
 */
export interface EcoPinSwap {
  kind: 'pin_swap';
  cellId: string;
  pinAId: string;
  pinBId: string;
  reason?: string;
}

/** Move a cell to a new position. The simplest legality-only op. */
export interface EcoCellMove {
  kind: 'cell_move';
  cellId: string;
  to: { x: number; y: number };
  reason?: string;
}

/* --------------------------------------------------------------------- */
/* Result types                                                            */
/* --------------------------------------------------------------------- */

export interface EcoOpResult {
  op: EcoOperation;
  status: 'applied' | 'rejected';
  message?: string;
}

export interface EcoApplyResult {
  before: DesignSnapshot;
  after: DesignSnapshot;
  ops: EcoOpResult[];
  diff: SnapshotDiff;
  /** True iff every op applied successfully. */
  ok: boolean;
}

/* --------------------------------------------------------------------- */
/* Apply                                                                   */
/* --------------------------------------------------------------------- */

/**
 * Apply a sequence of ECO operations to a snapshot. Operations are applied
 * in order; if one is rejected (illegal), the snapshot is rolled back to
 * its pre-op state for that operation only — subsequent ops still run
 * against the partially-mutated snapshot. Set `opts.atomic = true` to
 * abort and revert on the first rejection.
 */
export function applyEcoOperations(
  snapshot: DesignSnapshot,
  ops: EcoOperation[],
  opts: { atomic?: boolean } = {},
): EcoApplyResult {
  const original = snapshot;
  // Deep clone so callers' object isn't mutated.
  let working = clone(snapshot);
  const results: EcoOpResult[] = [];
  let allOk = true;

  for (const op of ops) {
    const before = clone(working);
    try {
      working = applyOne(working, op);
      const legality = checkLegality(working);
      if (!legality.ok) {
        results.push({ op, status: 'rejected', message: legality.message });
        working = before;
        allOk = false;
        if (opts.atomic) {
          working = clone(original);
          break;
        }
      } else {
        results.push({ op, status: 'applied' });
      }
    } catch (e: any) {
      results.push({ op, status: 'rejected', message: String(e?.message ?? e) });
      working = before;
      allOk = false;
      if (opts.atomic) {
        working = clone(original);
        break;
      }
    }
  }

  // Bump updatedAt if we touched anything.
  if (results.some(r => r.status === 'applied')) {
    working.updatedAt = new Date().toISOString();
  }

  return {
    before: original,
    after: working,
    ops: results,
    diff: diffSnapshots(original, working),
    ok: allOk,
  };
}

function applyOne(snap: DesignSnapshot, op: EcoOperation): DesignSnapshot {
  switch (op.kind) {
    case 'cell_swap':     return doCellSwap(snap, op);
    case 'buffer_insert': return doBufferInsert(snap, op);
    case 'gate_resize':   return doGateResize(snap, op);
    case 'pin_swap':      return doPinSwap(snap, op);
    case 'cell_move':     return doCellMove(snap, op);
  }
}

/* --------------------------------------------------------------------- */
/* Per-operation handlers                                                  */
/* --------------------------------------------------------------------- */

function doCellSwap(snap: DesignSnapshot, op: EcoCellSwap): DesignSnapshot {
  const idx = snap.cells.findIndex(c => c.id === op.cellId);
  if (idx < 0) throw new Error(`cell_swap: cell "${op.cellId}" not found`);
  const c = snap.cells[idx];
  const nc: Cell = {
    ...c,
    name: op.newName,
    width: op.newWidth ?? c.width,
    height: op.newHeight ?? c.height,
  };
  const cells = snap.cells.slice();
  cells[idx] = nc;
  return { ...snap, cells };
}

function doBufferInsert(snap: DesignSnapshot, op: EcoBufferInsert): DesignSnapshot {
  const netIdx = snap.nets.findIndex(n => n.id === op.netId);
  if (netIdx < 0) throw new Error(`buffer_insert: net "${op.netId}" not found`);
  if (snap.cells.some(c => c.id === op.buffer.id)) {
    throw new Error(`buffer_insert: cell id "${op.buffer.id}" already exists`);
  }
  const inPin = op.buffer.pins.find(p => p.id === op.bufferInputPinId);
  const outPin = op.buffer.pins.find(p => p.id === op.bufferOutputPinId);
  if (!inPin || !outPin) {
    throw new Error('buffer_insert: input/output pin id not found on buffer');
  }
  const net = snap.nets[netIdx];
  // Identify the driver pin = first pin on the net whose owning cell pin is 'output'.
  const driverPinId = findDriverPin(snap, net);
  if (!driverPinId) {
    throw new Error(`buffer_insert: no driver pin found on net "${op.netId}"`);
  }
  // Original net keeps the driver, we connect it to the buffer's input.
  const drivenNet: Net = {
    ...net,
    pins: [driverPinId, op.bufferInputPinId],
  };
  // New net carries buffer output → all original sinks.
  const sinks = net.pins.filter(p => p !== driverPinId);
  const newNet: Net = {
    id: `${net.id}__bufout`,
    name: `${net.name}__bufout`,
    pins: [op.bufferOutputPinId, ...sinks],
    weight: net.weight,
  };
  const nets = snap.nets.slice();
  nets[netIdx] = drivenNet;
  nets.push(newNet);
  return { ...snap, cells: [...snap.cells, op.buffer], nets };
}

function doGateResize(snap: DesignSnapshot, op: EcoGateResize): DesignSnapshot {
  if (!(op.scaleFactor > 0)) {
    throw new Error('gate_resize: scaleFactor must be positive');
  }
  const idx = snap.cells.findIndex(c => c.id === op.cellId);
  if (idx < 0) throw new Error(`gate_resize: cell "${op.cellId}" not found`);
  const c = snap.cells[idx];
  const nc: Cell = {
    ...c,
    width: c.width * op.scaleFactor,
    name: `${stripSizeSuffix(c.name)}_x${op.scaleFactor}`,
  };
  const cells = snap.cells.slice();
  cells[idx] = nc;
  return { ...snap, cells };
}

function doPinSwap(snap: DesignSnapshot, op: EcoPinSwap): DesignSnapshot {
  const cell = snap.cells.find(c => c.id === op.cellId);
  if (!cell) throw new Error(`pin_swap: cell "${op.cellId}" not found`);
  if (!cell.pins.some(p => p.id === op.pinAId) || !cell.pins.some(p => p.id === op.pinBId)) {
    throw new Error('pin_swap: both pin ids must belong to the cell');
  }
  const swap = (id: string) =>
    id === op.pinAId ? op.pinBId : id === op.pinBId ? op.pinAId : id;
  const nets = snap.nets.map(n => {
    if (!n.pins.includes(op.pinAId) && !n.pins.includes(op.pinBId)) return n;
    return { ...n, pins: n.pins.map(swap) };
  });
  return { ...snap, nets };
}

function doCellMove(snap: DesignSnapshot, op: EcoCellMove): DesignSnapshot {
  const idx = snap.cells.findIndex(c => c.id === op.cellId);
  if (idx < 0) throw new Error(`cell_move: cell "${op.cellId}" not found`);
  const cells = snap.cells.slice();
  cells[idx] = { ...cells[idx], position: { x: op.to.x, y: op.to.y } };
  return { ...snap, cells };
}

/* --------------------------------------------------------------------- */
/* Legality check                                                          */
/* --------------------------------------------------------------------- */

interface Legality { ok: boolean; message?: string }

export function checkLegality(snap: DesignSnapshot): Legality {
  // 1. Unique cell IDs.
  const seen = new Set<string>();
  for (const c of snap.cells) {
    if (seen.has(c.id)) return { ok: false, message: `duplicate cell id "${c.id}"` };
    seen.add(c.id);
  }
  // 2. Every net pin must be present on some cell.
  const allPinIds = new Set<string>();
  for (const c of snap.cells) for (const p of c.pins) allPinIds.add(p.id);
  for (const n of snap.nets) {
    for (const pid of n.pins) {
      if (!allPinIds.has(pid)) {
        return { ok: false, message: `net "${n.id}" references unknown pin "${pid}"` };
      }
    }
  }
  // 3. No two nets may drive the same pin (would be a short).
  const pinsOnNets = new Map<string, string>();
  for (const n of snap.nets) {
    for (const pid of n.pins) {
      const owner = pinsOnNets.get(pid);
      if (owner && owner !== n.id) {
        return { ok: false, message: `pin "${pid}" connected to multiple nets ("${owner}", "${n.id}")` };
      }
      pinsOnNets.set(pid, n.id);
    }
  }
  return { ok: true };
}

/* --------------------------------------------------------------------- */
/* Helpers                                                                 */
/* --------------------------------------------------------------------- */

function findDriverPin(snap: DesignSnapshot, net: Net): string | undefined {
  const pinDir = new Map<string, Pin['direction']>();
  for (const c of snap.cells) for (const p of c.pins) pinDir.set(p.id, p.direction);
  for (const pid of net.pins) {
    const d = pinDir.get(pid);
    if (d === 'output' || d === 'inout') return pid;
  }
  // Fall back to the first pin if no direction info.
  return net.pins[0];
}

function stripSizeSuffix(name: string): string {
  return name.replace(/_x[\d.]+$/i, '');
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}
