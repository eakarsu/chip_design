/**
 * Graph-based Static Timing Analysis.
 *
 * Builds a pin-level DAG from the engine Cell/Net types used by the
 * placement and pin-assignment modules, then propagates:
 *   - arrival times forward from startpoints (io output ports),
 *   - required times backward from endpoints (io input ports),
 * and computes slack = required - arrival on every pin.
 *
 * Edge model:
 *   - cell internal: input pin -> output pin, delay = cellDelay
 *     (constant per cell, optionally overridden via cellDelays).
 *   - net wire: every driver output pin -> every sink input pin,
 *     delay = wireDelayPerUnit * manhattan(driver, sink) * net.weight.
 *
 * Combinational only — no flip-flop latching, no clock skew.
 * Cycles throw; a real STA tool would break loops at sequential
 * boundaries, but that's out of scope here.
 */

import type { Cell, Net } from '@/types/algorithms';

export interface STAInput {
  cells: Cell[];
  nets:  Net[];
  clockPeriod: number;
  /** Default combinational delay across each std/macro cell (input → output). */
  cellDelay?: number;
  /** Delay per unit of manhattan distance on a net segment. */
  wireDelayPerUnit?: number;
  /** Override per-cell delay by cell.id. */
  cellDelays?: Record<string, number>;
}

export interface PinTiming {
  pinId: string;
  cellId: string;
  arrival:  number;
  required: number;
  slack:    number;
}

export interface STAResult {
  pins: PinTiming[];
  /** Worst negative slack: min slack across endpoints; ≥0 means met. */
  wns: number;
  /** Total negative slack: sum of |slack| over endpoints with slack<0. */
  tns: number;
  /** Worst path arrival time. */
  maxArrival: number;
  /** Pin-id chain along the worst-slack endpoint's longest path. */
  criticalPath: string[];
  setupViolations: number;
  endpoints:   number;
  startpoints: number;
  runtimeMs: number;
}

interface PinNode {
  id: string;
  cellId: string;
  isStartpoint: boolean;
  isEndpoint:   boolean;
  pos: { x: number; y: number };
}
interface Edge { to: string; delay: number; kind: 'cell' | 'wire'; }

function manhattan(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function runSTA(input: STAInput): STAResult {
  const t0 = performance.now();
  const cellDelay        = input.cellDelay        ?? 0.1;
  const wireDelayPerUnit = input.wireDelayPerUnit ?? 0.001;
  const overrides        = input.cellDelays       ?? {};
  const clk              = input.clockPeriod;

  if (!Number.isFinite(clk) || clk <= 0) {
    throw new Error('clockPeriod must be a positive number');
  }

  // 1. Build pin nodes.
  const pins     = new Map<string, PinNode>();
  const cellById = new Map<string, Cell>();
  for (const c of input.cells) {
    cellById.set(c.id, c);
    const cx = c.position?.x ?? 0;
    const cy = c.position?.y ?? 0;
    for (const pin of c.pins) {
      const isIO     = c.type === 'io';
      const isInput  = pin.direction === 'input';
      const isOutput = pin.direction === 'output';
      pins.set(pin.id, {
        id: pin.id,
        cellId: c.id,
        // io output drives into the design; io input sinks from it.
        isStartpoint: isIO && isOutput,
        isEndpoint:   isIO && isInput,
        pos: { x: cx + pin.position.x, y: cy + pin.position.y },
      });
    }
  }

  // 2. Build edges + indegree.
  const edges = new Map<string, Edge[]>();
  const indeg = new Map<string, number>();
  for (const id of pins.keys()) indeg.set(id, 0);
  const addEdge = (from: string, to: string, delay: number, kind: 'cell' | 'wire') => {
    const arr = edges.get(from) ?? [];
    arr.push({ to, delay, kind });
    edges.set(from, arr);
    indeg.set(to, (indeg.get(to) ?? 0) + 1);
  };

  // 2a. Cell internal edges.
  for (const c of input.cells) {
    if (c.type === 'io') continue;
    const ins  = c.pins.filter(pp => pp.direction === 'input');
    const outs = c.pins.filter(pp => pp.direction === 'output');
    const d = overrides[c.id] ?? cellDelay;
    for (const i of ins) for (const o of outs) addEdge(i.id, o.id, d, 'cell');
  }

  // 2b. Wire edges.
  for (const net of input.nets) {
    const netPins = net.pins
      .map(pid => pins.get(pid))
      .filter((x): x is PinNode => !!x);
    if (netPins.length < 2) continue;
    const drivers = netPins.filter(pn => {
      const cell = cellById.get(pn.cellId);
      const pin  = cell?.pins.find(pp => pp.id === pn.id);
      return pin?.direction === 'output';
    });
    const driverSet = new Set(drivers.map(d => d.id));
    const sinks = netPins.filter(pn => !driverSet.has(pn.id));
    const w = net.weight || 1;
    for (const d of drivers) {
      for (const s of sinks) {
        const wd = wireDelayPerUnit * manhattan(d.pos, s.pos) * w;
        addEdge(d.id, s.id, wd, 'wire');
      }
    }
  }

  // 3. Topological order (Kahn).
  const order: string[] = [];
  const indegLocal = new Map(indeg);
  const work: string[] = [];
  for (const [id, d] of indegLocal) if (d === 0) work.push(id);
  while (work.length) {
    const u = work.shift()!;
    order.push(u);
    for (const e of edges.get(u) ?? []) {
      const d = (indegLocal.get(e.to) ?? 0) - 1;
      indegLocal.set(e.to, d);
      if (d === 0) work.push(e.to);
    }
  }
  if (order.length !== pins.size) {
    throw new Error('Combinational cycle detected in timing graph');
  }

  // 4. Forward arrival.
  const arrival = new Map<string, number>();
  const predOf  = new Map<string, string | null>();
  for (const id of pins.keys()) {
    const node = pins.get(id)!;
    // Sources of arrival: explicit startpoints OR pins with no predecessors.
    arrival.set(id, node.isStartpoint || (indeg.get(id) ?? 0) === 0 ? 0 : -Infinity);
    predOf.set(id, null);
  }
  for (const u of order) {
    const au = arrival.get(u)!;
    if (au === -Infinity) continue;
    for (const e of edges.get(u) ?? []) {
      const cand = au + e.delay;
      if (cand > (arrival.get(e.to) ?? -Infinity)) {
        arrival.set(e.to, cand);
        predOf.set(e.to, u);
      }
    }
  }

  // 5. Backward required.
  const required = new Map<string, number>();
  for (const id of pins.keys()) required.set(id, +Infinity);
  for (const id of pins.keys()) {
    const node = pins.get(id)!;
    const noFanout = (edges.get(id)?.length ?? 0) === 0;
    if (node.isEndpoint || noFanout) required.set(id, clk);
  }
  for (let i = order.length - 1; i >= 0; i--) {
    const u = order[i];
    for (const e of edges.get(u) ?? []) {
      const cand = (required.get(e.to) ?? +Infinity) - e.delay;
      if (cand < (required.get(u) ?? +Infinity)) required.set(u, cand);
    }
  }

  // 6. Per-pin timing + endpoint stats.
  const pinTimings: PinTiming[] = [];
  let wns = +Infinity;
  let tns = 0;
  let maxArrival = 0;
  let worstEndpoint: string | null = null;
  let endpointCount = 0;
  let startCount = 0;
  let setupViolations = 0;
  for (const id of pins.keys()) {
    const a = arrival.get(id) ?? 0;
    const r = required.get(id) ?? clk;
    const s = r - a;
    const node = pins.get(id)!;
    pinTimings.push({ pinId: id, cellId: node.cellId, arrival: a, required: r, slack: s });
    if (Number.isFinite(a) && a > maxArrival) maxArrival = a;
    if (node.isStartpoint) startCount++;
    if (node.isEndpoint) {
      endpointCount++;
      if (s < wns) { wns = s; worstEndpoint = id; }
      if (s < 0) { tns += -s; setupViolations++; }
    }
  }
  if (!Number.isFinite(wns)) wns = 0;

  // 7. Critical path: walk predOf from worst endpoint to its origin.
  const criticalPath: string[] = [];
  if (worstEndpoint) {
    let cur: string | null = worstEndpoint;
    while (cur) {
      criticalPath.push(cur);
      cur = predOf.get(cur) ?? null;
    }
    criticalPath.reverse();
  }

  return {
    pins: pinTimings,
    wns,
    tns,
    maxArrival,
    criticalPath,
    setupViolations,
    endpoints:   endpointCount,
    startpoints: startCount,
    runtimeMs: performance.now() - t0,
  };
}
