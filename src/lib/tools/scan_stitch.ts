/**
 * Scan-chain stitcher.
 *
 * Given a list of placed flops, partition them into a fixed number of
 * scan chains (one per scan-in pin) and order each chain so that the
 * total Manhattan-distance hookup wire is small. We use a greedy
 * nearest-neighbour walk seeded from the corner closest to the
 * scan-in port — not optimal, but predictable, and fast enough to
 * recompute on every placement edit.
 *
 * No clock-domain awareness: callers should pre-bucket flops by their
 * launch clock and call us once per domain.
 */
export interface ScanFlop { name: string; x: number; y: number }

export interface ScanSpec {
  flops: ScanFlop[];
  /** Number of independent scan chains (= number of scan-in ports). */
  numChains: number;
  /** Optional anchor where each scan-in port lives. Defaults to (0, 0). */
  scanIn?: { x: number; y: number };
}

export interface ScanChain {
  index: number;
  order: string[];
  wireLength: number;
}

export interface ScanResult {
  chains: ScanChain[];
  totalWire: number;
  longestChain: number;
  /** Imbalance metric: max(len) − min(len) over chains. */
  imbalance: number;
}

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

export function stitchScan(spec: ScanSpec): ScanResult {
  if (!Array.isArray(spec.flops)) throw new Error('flops must be an array');
  if (spec.numChains < 1) throw new Error('numChains must be >= 1');
  const anchor = spec.scanIn ?? { x: 0, y: 0 };

  // Round-robin bucketing in increasing-distance order keeps chains balanced
  // in length and roughly co-located.
  const sorted = [...spec.flops].sort(
    (a, b) => dist(a, anchor) - dist(b, anchor),
  );
  const buckets: ScanFlop[][] = Array.from(
    { length: spec.numChains }, () => [],
  );
  sorted.forEach((f, i) => buckets[i % spec.numChains].push(f));

  // Greedy nearest-neighbour ordering starting from the bucket member
  // closest to the scan-in port.
  const chains: ScanChain[] = buckets.map((bucket, idx) => {
    if (bucket.length === 0) return { index: idx, order: [], wireLength: 0 };
    let cur = bucket.reduce((best, f) =>
      dist(f, anchor) < dist(best, anchor) ? f : best, bucket[0]);
    const remaining = new Set(bucket.map(f => f.name));
    const byName = new Map(bucket.map(f => [f.name, f]));
    const order: string[] = [];
    let wire = dist(cur, anchor);
    while (remaining.size > 0) {
      order.push(cur.name);
      remaining.delete(cur.name);
      if (remaining.size === 0) break;
      let next = cur, best = Infinity;
      for (const name of remaining) {
        const f = byName.get(name)!;
        const d = dist(cur, f);
        if (d < best) { best = d; next = f; }
      }
      wire += best;
      cur = next;
    }
    return { index: idx, order, wireLength: wire };
  });

  const lens = chains.map(c => c.order.length);
  return {
    chains,
    totalWire: chains.reduce((a, c) => a + c.wireLength, 0),
    longestChain: Math.max(0, ...lens),
    imbalance: lens.length ? Math.max(...lens) - Math.min(...lens) : 0,
  };
}
