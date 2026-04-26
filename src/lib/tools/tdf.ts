/**
 * TDF (Transition Delay Fault) coverage estimator.
 *
 * Models slow-to-rise / slow-to-fall faults on every gate output. A
 * fault is "covered" by a vector pair (V1, V2) if:
 *   1. V1 leaves the node at the value opposite the slow direction
 *      (e.g. for slow-to-rise, V1=0).
 *   2. V2 transitions the node to the slow direction (e.g. V2=1).
 *   3. The transition propagates to a primary output by the launch
 *      capture cycle — modelled by re-evaluating with the fault forced.
 *
 * Same caveat as the ATPG estimator: random pattern, no structural
 * sensitisation. Useful for getting a coverage curve over vector count.
 */
import { type AtpgGate, type AtpgSpec } from './atpg';

export interface TdfSpec extends Omit<AtpgSpec, 'vectors'> {
  /** Number of vector pairs. */
  pairs: number;
}

export interface TdfResult {
  total: number;
  detected: number;
  coverage: number;
  curve: number[];
}

function topo(spec: { pis: string[]; gates: AtpgGate[] }): AtpgGate[] {
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

function evalGate(op: AtpgGate['op'], inputs: number[]): number {
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

export function runTdf(spec: TdfSpec): TdfResult {
  if (spec.pairs < 1) throw new Error('pairs must be >= 1');
  const topoGates = topo(spec);
  const allNodes = [...spec.pis, ...spec.gates.map(g => g.name)];
  // STR (slow-to-rise, target final 1) + STF (slow-to-fall, target final 0)
  const faults: { node: string; dir: 0 | 1 }[] = [];
  for (const n of allNodes) faults.push({ node: n, dir: 1 }, { node: n, dir: 0 });
  const detected = new Set<string>();
  const curve: number[] = [];
  let s = (spec.seed ?? 1) >>> 0;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0xffffffff; };

  for (let p = 0; p < spec.pairs; p++) {
    const v1: Record<string, number> = {}, v2: Record<string, number> = {};
    for (const pi of spec.pis) {
      v1[pi] = rnd() < 0.5 ? 0 : 1;
      v2[pi] = rnd() < 0.5 ? 0 : 1;
    }
    const sim1 = simulate(topoGates, v1);
    const sim2 = simulate(topoGates, v2);
    for (const f of faults) {
      const key = `${f.node}/${f.dir}`;
      if (detected.has(key)) continue;
      // Need transition opposite→dir on the node.
      if (sim1[f.node] === f.dir) continue;
      if (sim2[f.node] !== f.dir) continue;
      // Slow fault holds node at the *old* (V1) value during V2 cycle.
      const stuck = 1 - f.dir;
      const faulty2 = simulate(topoGates, v2, f.node, stuck);
      const propagates = spec.pos.some(po => sim2[po] !== faulty2[po]);
      if (propagates) detected.add(key);
    }
    curve.push(detected.size / faults.length);
  }
  return {
    total: faults.length,
    detected: detected.size,
    coverage: detected.size / faults.length,
    curve,
  };
}
