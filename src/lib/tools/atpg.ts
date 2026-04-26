/**
 * ATPG (automatic test pattern generation) fault-coverage estimator.
 *
 * The combinational netlist is described as a list of nodes (PIs, gates,
 * POs). For each node we enumerate stuck-at-0 / stuck-at-1 faults; that
 * forms the collapsed fault list. We then drive a fixed number of
 * pseudo-random input vectors, simulate, and count how many faults are
 * detected (i.e. propagate to a primary output where the faulty value
 * differs from the fault-free value).
 *
 * This is a teaching-grade estimator: it skips fault collapsing and
 * doesn't run D-algorithm style structural ATPG. It's good enough to
 * give a coverage curve, identify ATPG-resistant signals, and rank
 * vector counts.
 */
export type GateOp = 'and' | 'or' | 'nand' | 'nor' | 'xor' | 'not' | 'buf';
export interface AtpgGate {
  name: string;
  op: GateOp;
  /** Names of input nodes — primary inputs or other gates. */
  inputs: string[];
}
export interface AtpgSpec {
  /** Primary input names. */
  pis: string[];
  /** Combinational gates, in any order — we topologically sort. */
  gates: AtpgGate[];
  /** Names of nodes that drive primary outputs. */
  pos: string[];
  /** How many random vectors to apply. */
  vectors: number;
  /** PRNG seed (for repeatable runs). */
  seed?: number;
}
export interface FaultReport {
  node: string;
  sa0: boolean;
  sa1: boolean;
}
export interface AtpgResult {
  total: number;
  detected: number;
  coverage: number;
  /** Per-vector cumulative coverage (0..1). */
  curve: number[];
  /** Faults still undetected at the end. */
  undetected: { node: string; stuck: 0 | 1 }[];
}

function evalGate(op: GateOp, inputs: number[]): number {
  switch (op) {
    case 'and':  return inputs.every(v => v === 1) ? 1 : 0;
    case 'or':   return inputs.some(v => v === 1) ? 1 : 0;
    case 'nand': return inputs.every(v => v === 1) ? 0 : 1;
    case 'nor':  return inputs.some(v => v === 1) ? 0 : 1;
    case 'xor':  return inputs.reduce((a, b) => a ^ b, 0);
    case 'not':  return inputs[0] ? 0 : 1;
    case 'buf':  return inputs[0] ? 1 : 0;
  }
}

function topo(spec: AtpgSpec): AtpgGate[] {
  const known = new Set(spec.pis);
  const remaining = [...spec.gates];
  const out: AtpgGate[] = [];
  while (remaining.length) {
    const idx = remaining.findIndex(g => g.inputs.every(i => known.has(i)));
    if (idx < 0) throw new Error('cycle or undefined input');
    out.push(remaining[idx]);
    known.add(remaining[idx].name);
    remaining.splice(idx, 1);
  }
  return out;
}

function simulate(
  topoGates: AtpgGate[], piVals: Record<string, number>,
  injectNode?: string, injectVal?: number,
): Record<string, number> {
  const v: Record<string, number> = { ...piVals };
  if (injectNode && injectNode in v) v[injectNode] = injectVal!;
  for (const g of topoGates) {
    let val = evalGate(g.op, g.inputs.map(i => v[i]));
    if (injectNode === g.name) val = injectVal!;
    v[g.name] = val;
  }
  return v;
}

export function runAtpg(spec: AtpgSpec): AtpgResult {
  if (spec.vectors < 1) throw new Error('vectors must be >= 1');
  const topoGates = topo(spec);
  const allNodes = [...spec.pis, ...spec.gates.map(g => g.name)];
  // Fault list: SA0 + SA1 on every signal.
  const faults: { node: string; stuck: 0 | 1 }[] = [];
  for (const n of allNodes) {
    faults.push({ node: n, stuck: 0 }, { node: n, stuck: 1 });
  }
  const detected = new Set<string>();
  const curve: number[] = [];
  let s = (spec.seed ?? 1) >>> 0;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0xffffffff; };

  for (let v = 0; v < spec.vectors; v++) {
    const piVals: Record<string, number> = {};
    for (const pi of spec.pis) piVals[pi] = rnd() < 0.5 ? 0 : 1;
    const fault = simulate(topoGates, piVals);
    for (const f of faults) {
      const key = `${f.node}/${f.stuck}`;
      if (detected.has(key)) continue;
      // Skip injecting opposite-of-fault-free value on a known-irrelevant
      // node only if the node already carries that value (no fault excited).
      if (fault[f.node] === f.stuck) continue;
      const faulty = simulate(topoGates, piVals, f.node, f.stuck);
      const propagates = spec.pos.some(po => fault[po] !== faulty[po]);
      if (propagates) detected.add(key);
    }
    curve.push(detected.size / faults.length);
  }
  const undetected = faults.filter(f => !detected.has(`${f.node}/${f.stuck}`));
  return {
    total: faults.length,
    detected: detected.size,
    coverage: detected.size / faults.length,
    curve,
    undetected,
  };
}
