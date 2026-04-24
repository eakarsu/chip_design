/**
 * Cross-language "design state" snapshot.
 *
 * The chip_design project has a TypeScript front + Next.js API server, a
 * FastAPI/PyTorch service, and now a SQLite store — three places that all
 * need to reason about the same Design. Rather than shipping three nearly-
 * identical schemas, we centralize a JSON wire format here.
 *
 * Design goals:
 *   1. Stable versioned format (`schemaVersion`) — additive only.
 *   2. Lossless round-trip between TS `Design` objects and the JSON blob.
 *   3. Computable content-hash so the Python side can cache heavy analyses.
 *
 * The matching Python dataclass lives at
 * `services/ml-service/design_state.py` and is generated from this file's
 * JSON schema via a small codegen step (`npm run gen:design-schema`).
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { createHash } from 'crypto';
import type { Cell, Net, Wire } from '@/types/algorithms';

export const DESIGN_SCHEMA_VERSION = 1;

export interface DesignSnapshot {
  schemaVersion: number;
  id: string;
  name: string;
  ownerId?: string;
  /** ISO-8601 timestamps. */
  createdAt: string;
  updatedAt: string;
  /** Die-area bounding box in micron coordinates. */
  dieArea?: { width: number; height: number };
  cells: Cell[];
  nets: Net[];
  wires: Wire[];
  /** Original sources, if imported from external formats. */
  verilog?: string;
  sdc?: string;
  lef?: string;
  def?: string;
  /** Free-form analyses attached to the snapshot (timing, power, etc.). */
  analyses?: Record<string, unknown>;
  /** Any extra user metadata (tags, flow-state, etc.). */
  metadata?: Record<string, unknown>;
}

/**
 * Serialize a TS Design + associated artifacts to a canonical JSON object.
 * Object keys are sorted inside `hashSnapshot()` so identical content
 * always hashes identically regardless of insertion order.
 */
export function toSnapshot(params: {
  id: string;
  name: string;
  ownerId?: string;
  createdAt: string;
  updatedAt: string;
  cells: Cell[];
  nets: Net[];
  wires: Wire[];
  dieArea?: { width: number; height: number };
  verilog?: string;
  sdc?: string;
  lef?: string;
  def?: string;
  analyses?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}): DesignSnapshot {
  return {
    schemaVersion: DESIGN_SCHEMA_VERSION,
    id: params.id, name: params.name,
    ownerId: params.ownerId,
    createdAt: params.createdAt,
    updatedAt: params.updatedAt,
    dieArea: params.dieArea,
    cells: params.cells,
    nets: params.nets,
    wires: params.wires,
    verilog: params.verilog,
    sdc: params.sdc,
    lef: params.lef,
    def: params.def,
    analyses: params.analyses,
    metadata: params.metadata,
  };
}

/**
 * Deserialize a JSON blob into a DesignSnapshot, upgrading older schema
 * versions where possible. Throws on incompatible formats.
 */
export function fromSnapshotJson(raw: string | object): DesignSnapshot {
  const obj: any = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (typeof obj !== 'object' || obj === null) {
    throw new Error('design snapshot: expected a JSON object');
  }
  const v = obj.schemaVersion;
  if (typeof v !== 'number') {
    throw new Error('design snapshot: missing schemaVersion');
  }
  if (v > DESIGN_SCHEMA_VERSION) {
    throw new Error(`design snapshot: schemaVersion ${v} is newer than this build (${DESIGN_SCHEMA_VERSION})`);
  }
  // All v1 and below: fields are identical; just validate required keys.
  for (const k of ['id', 'name', 'createdAt', 'updatedAt', 'cells', 'nets', 'wires']) {
    if (!(k in obj)) throw new Error(`design snapshot: missing field "${k}"`);
  }
  if (!Array.isArray(obj.cells) || !Array.isArray(obj.nets) || !Array.isArray(obj.wires)) {
    throw new Error('design snapshot: cells/nets/wires must be arrays');
  }
  // Clamp unknown future fields out of the return type by spreading a fresh object.
  return {
    schemaVersion: DESIGN_SCHEMA_VERSION,
    id: obj.id, name: obj.name,
    ownerId: obj.ownerId,
    createdAt: obj.createdAt,
    updatedAt: obj.updatedAt,
    dieArea: obj.dieArea,
    cells: obj.cells,
    nets: obj.nets,
    wires: obj.wires,
    verilog: obj.verilog, sdc: obj.sdc, lef: obj.lef, def: obj.def,
    analyses: obj.analyses, metadata: obj.metadata,
  };
}

/**
 * Stable content hash over the snapshot. Keys are sorted at every level
 * so Python's `json.dumps(..., sort_keys=True)` produces the same hash.
 * The hash excludes `updatedAt` and `analyses` (volatile) and includes
 * only what constitutes the *design* itself.
 */
export function hashSnapshot(snap: DesignSnapshot): string {
  const hashable = {
    schemaVersion: snap.schemaVersion,
    id: snap.id, name: snap.name,
    dieArea: snap.dieArea ?? null,
    cells: snap.cells, nets: snap.nets, wires: snap.wires,
    verilog: snap.verilog ?? null, sdc: snap.sdc ?? null,
    lef: snap.lef ?? null, def: snap.def ?? null,
  };
  const json = stableStringify(hashable);
  return createHash('sha256').update(json).digest('hex');
}

/**
 * Lightweight structural diff between two snapshots. Useful both for ECO
 * (task #34) and for the Python side to decide whether an incremental
 * analysis suffices or a full rerun is required.
 */
export interface SnapshotDiff {
  cellsAdded: string[];
  cellsRemoved: string[];
  cellsMoved: { id: string; from: { x: number; y: number }; to: { x: number; y: number } }[];
  netsAdded: string[];
  netsRemoved: string[];
  netsChanged: string[];
}

export function diffSnapshots(a: DesignSnapshot, b: DesignSnapshot): SnapshotDiff {
  const aCells = new Map(a.cells.map(c => [c.id, c]));
  const bCells = new Map(b.cells.map(c => [c.id, c]));
  const aNets  = new Map(a.nets.map(n => [n.id, n]));
  const bNets  = new Map(b.nets.map(n => [n.id, n]));

  const cellsAdded: string[] = [];
  const cellsRemoved: string[] = [];
  const cellsMoved: SnapshotDiff['cellsMoved'] = [];
  for (const [id, c] of bCells) if (!aCells.has(id)) cellsAdded.push(id);
  for (const [id, c] of aCells) {
    if (!bCells.has(id)) { cellsRemoved.push(id); continue; }
    const bc = bCells.get(id)!;
    const fp = c.position, tp = bc.position;
    if (fp && tp && (fp.x !== tp.x || fp.y !== tp.y)) {
      cellsMoved.push({ id, from: fp, to: tp });
    }
  }

  const netsAdded: string[] = [];
  const netsRemoved: string[] = [];
  const netsChanged: string[] = [];
  for (const [id] of bNets) if (!aNets.has(id)) netsAdded.push(id);
  for (const [id, n] of aNets) {
    if (!bNets.has(id)) { netsRemoved.push(id); continue; }
    const bn = bNets.get(id)!;
    if (n.pins.length !== bn.pins.length ||
        n.pins.some((p, i) => p !== bn.pins[i])) {
      netsChanged.push(id);
    }
  }
  return { cellsAdded, cellsRemoved, cellsMoved, netsAdded, netsRemoved, netsChanged };
}

/** Deterministic stringify with sorted keys at every nesting level. */
export function stableStringify(value: any): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  const keys = Object.keys(value).sort();
  const parts: string[] = [];
  for (const k of keys) {
    if (value[k] === undefined) continue;
    parts.push(JSON.stringify(k) + ':' + stableStringify(value[k]));
  }
  return '{' + parts.join(',') + '}';
}
