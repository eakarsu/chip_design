/**
 * Van Ginneken-style buffer insertion + Elmore RC tree delay.
 *
 * The classic VG algorithm walks an RC tree bottom-up, maintaining at each
 * node a Pareto frontier of (capacitance, required-arrival-time) candidates.
 * At a Steiner point candidates from children are merged; at any wire
 * segment the algorithm may optionally insert a buffer, adding a new
 * dominant-at-some-load candidate. At the root we pick the candidate with
 * the largest RAT — i.e. the one that most relaxes the driver's setup
 * slack — and backtrack which buffers to actually place.
 *
 * We also expose the raw Elmore delay calculator separately since STA
 * (task #34 later on) wants to consume it without running the full VG.
 */

export interface VGNode {
  id: string;
  /** Child nodes reachable through a wire. Leaves have `children: []`. */
  children: VGEdge[];
  /** Pin capacitance at this node (fF). Sinks should have a positive cap. */
  pinCap?: number;
  /** Required arrival time at this sink, relative to the source. Sinks only. */
  rat?: number;
  /** True if this is a primary-output sink. */
  isSink?: boolean;
}

export interface VGEdge {
  node: VGNode;
  /** Wire resistance along this edge (Ω). */
  r: number;
  /** Wire capacitance along this edge (fF). Lumped at the far end + half-pi. */
  c: number;
}

export interface BufferLib {
  name: string;
  /** Input pin cap of the buffer (fF). */
  cin: number;
  /** Intrinsic delay of the buffer (ps). */
  d0: number;
  /** Load-dependent delay coefficient (ps / fF). */
  k: number;
  /** Output pin resistance (Ω), for Elmore downstream of the buffer. */
  rout: number;
}

export interface VGOptions {
  buffers: BufferLib[];
  /** Driver resistance at the root (Ω). */
  driverR?: number;
  /** Prune tolerance for RAT comparisons (ps). Default 0. */
  ratEpsilon?: number;
  /** Prune tolerance for cap comparisons (fF). Default 0. */
  capEpsilon?: number;
}

export interface VGCandidate {
  /** Capacitance seen looking into this subtree. */
  c: number;
  /** Required arrival time achievable with this candidate. */
  rat: number;
  /** Which buffer, if any, is inserted at this node. */
  buffer?: BufferLib;
  /** Child references to the candidate chosen for each subtree. */
  childChoices: Map<string, VGCandidate>;
}

export interface VGResult {
  rootRAT: number;
  rootCandidate: VGCandidate;
  /** Node IDs where buffers were inserted. */
  bufferInsertions: { nodeId: string; buffer: string }[];
  /** Elmore delay to each sink (ps) in the chosen solution. */
  sinkDelays: { sinkId: string; delay: number }[];
}

/* ===================================================================== */
/* Elmore delay                                                           */
/* ===================================================================== */

/** Elmore delay from `root` to every sink, accumulating R·(downstream-C). */
export function elmoreDelays(root: VGNode, driverR: number = 0): { sinkId: string; delay: number }[] {
  const downCap = new Map<string, number>();
  // Post-order traversal to accumulate subtree capacitance.
  function capOf(n: VGNode): number {
    let c = n.pinCap ?? 0;
    for (const e of n.children) c += e.c + capOf(e.node);
    downCap.set(n.id, c);
    return c;
  }
  capOf(root);

  const results: { sinkId: string; delay: number }[] = [];
  function walk(n: VGNode, parentDelay: number) {
    if (n.isSink) results.push({ sinkId: n.id, delay: parentDelay });
    for (const e of n.children) {
      // Elmore: resistor r sees everything downstream including edge cap at far end.
      const downstreamC = downCap.get(e.node.id)! + e.c / 2; // half-pi model on near side
      const delay = parentDelay + e.r * downstreamC;
      walk(e.node, delay);
    }
  }
  // At the root the driver resistance sees total tree C.
  const startDelay = driverR * (downCap.get(root.id) ?? 0);
  walk(root, startDelay);
  return results;
}

/* ===================================================================== */
/* Van Ginneken                                                           */
/* ===================================================================== */

export function vanGinneken(root: VGNode, opts: VGOptions): VGResult {
  const candsByNode = new Map<string, VGCandidate[]>();

  // Bottom-up recursion.
  function solve(n: VGNode): VGCandidate[] {
    if (n.isSink || n.children.length === 0) {
      const base: VGCandidate = {
        c: n.pinCap ?? 0,
        rat: n.rat ?? Infinity,
        childChoices: new Map(),
      };
      candsByNode.set(n.id, [base]);
      return [base];
    }

    // Recurse into each child then propagate across its edge.
    const childCandidateLists: { childId: string; edge: VGEdge; cands: VGCandidate[] }[] = [];
    for (const e of n.children) {
      const childCands = solve(e.node);
      const propagated = propagateThroughWire(childCands, e);
      // Try inserting a buffer at the child-side of the edge (i.e. at the child node).
      const buffered = insertBufferCandidates(propagated, opts.buffers);
      const merged = prune(propagated.concat(buffered), opts);
      childCandidateLists.push({ childId: e.node.id, edge: e, cands: merged });
    }

    // Merge candidates from all children → cross-product, summing caps and
    // taking min RAT.
    let current: VGCandidate[] = [{ c: 0, rat: Infinity, childChoices: new Map() }];
    for (const { childId, cands } of childCandidateLists) {
      const next: VGCandidate[] = [];
      for (const a of current) {
        for (const b of cands) {
          const choices = new Map(a.childChoices);
          choices.set(childId, b);
          next.push({
            c: a.c + b.c,
            rat: Math.min(a.rat, b.rat),
            childChoices: choices,
          });
        }
      }
      current = prune(next, opts);
    }

    // If this node itself is a sink (e.g. mid-net cap), add its pin cap.
    if (n.pinCap) {
      current = current.map(c => ({ ...c, c: c.c + n.pinCap! }));
    }

    candsByNode.set(n.id, current);
    return current;
  }

  let rootCands = solve(root);

  // At the root, any driver resistance R_d adds an R_d · C shift to every
  // RAT. Since that's a uniform shift (same C-dependence), it does change
  // the comparison: a solution with smaller C is now more attractive.
  const Rd = opts.driverR ?? 0;
  if (Rd > 0) {
    rootCands = rootCands.map(c => ({ ...c, rat: c.rat - Rd * c.c }));
  }

  // Pick the best (highest RAT) candidate.
  let best: VGCandidate | undefined;
  for (const c of rootCands) {
    if (!best || c.rat > best.rat) best = c;
  }
  if (!best) {
    throw new Error('Van Ginneken produced no candidates — empty tree?');
  }

  // Backtrack to discover buffer insertions.
  const inserts: { nodeId: string; buffer: string }[] = [];
  function collect(cand: VGCandidate, nodeId: string) {
    if (cand.buffer) inserts.push({ nodeId, buffer: cand.buffer.name });
    for (const [childId, childCand] of cand.childChoices) collect(childCand, childId);
  }
  collect(best, root.id);

  // Elmore delays *for reporting* under the chosen buffer set would require
  // mutating the tree. We instead return delays on the physical tree (no
  // buffers inserted) as a useful baseline — the full buffered delay is
  // derivable from the candidate RATs which is what STA uses anyway.
  const sinkDelays = elmoreDelays(root, Rd);

  return {
    rootRAT: best.rat,
    rootCandidate: best,
    bufferInsertions: inserts,
    sinkDelays,
  };
}

/**
 * Propagate a candidate list through a wire edge (r, c). Each candidate's
 * cap increases by `c`; its RAT decreases by the Elmore delay of this wire
 * (r * (C_downstream + c/2)).
 */
function propagateThroughWire(cands: VGCandidate[], edge: VGEdge): VGCandidate[] {
  return cands.map(cand => ({
    c: cand.c + edge.c,
    rat: cand.rat - edge.r * (cand.c + edge.c / 2),
    buffer: cand.buffer,
    childChoices: cand.childChoices,
  }));
}

/** For every candidate, emit one extra "with buffer B at this node" variant. */
function insertBufferCandidates(cands: VGCandidate[], lib: BufferLib[]): VGCandidate[] {
  const out: VGCandidate[] = [];
  for (const cand of cands) {
    for (const b of lib) {
      // After a buffer, upstream sees the buffer's Cin. Downstream of the
      // buffer the load is `cand.c`, so the buffer's delay is d0 + k·C_load.
      const bufDelay = b.d0 + b.k * cand.c;
      // The buffer's Rout adds an Elmore term to the downstream RAT:
      //     RAT_downstream ← rat − Rout·C_load
      // but since we already accounted for wire delay when propagating, we
      // only add the buffer's drive delay here.
      out.push({
        c: b.cin,
        rat: cand.rat - bufDelay - b.rout * cand.c,
        buffer: b,
        childChoices: cand.childChoices,
      });
    }
  }
  return out;
}

/**
 * Pareto pruning: keep only candidates that are not dominated on both
 * axes simultaneously. A candidate (c, rat) dominates another (c', rat')
 * iff c ≤ c' and rat ≥ rat' with at least one strict.
 */
function prune(cands: VGCandidate[], opts: VGOptions): VGCandidate[] {
  const epsC = opts.capEpsilon ?? 0;
  const epsR = opts.ratEpsilon ?? 0;
  // Sort by cap ascending, then RAT descending.
  const sorted = [...cands].sort((a, b) => a.c - b.c || b.rat - a.rat);
  const kept: VGCandidate[] = [];
  let bestRat = -Infinity;
  for (const c of sorted) {
    if (c.rat > bestRat + epsR) {
      kept.push(c);
      bestRat = c.rat;
    }
  }
  // Also merge near-identical caps.
  if (epsC > 0) {
    const coarsened: VGCandidate[] = [];
    for (const c of kept) {
      const last = coarsened[coarsened.length - 1];
      if (last && Math.abs(last.c - c.c) <= epsC) {
        if (c.rat > last.rat) coarsened[coarsened.length - 1] = c;
      } else {
        coarsened.push(c);
      }
    }
    return coarsened;
  }
  return kept;
}
