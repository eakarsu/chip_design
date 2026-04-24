/**
 * PathFinder negotiated-congestion routing (McMurchie & Ebeling, 1995).
 *
 * Detailed routing as a sequence of single-source shortest-path problems
 * that *negotiate* for shared resources:
 *
 *   1. Route every net independently along the cheapest path. If two nets
 *      use the same edge, that edge is over-subscribed.
 *   2. Add a `present_cost` penalty proportional to over-subscription on
 *      every shared edge. Nets that can route around the shared edge will
 *      do so on the next iteration; those that *can't* keep using it.
 *   3. Add a `history_cost` penalty that accumulates *each* iteration the
 *      edge stays over-subscribed. This is the "negotiation": persistently
 *      contested edges get progressively more expensive, forcing the lowest-
 *      flexibility nets to grab them and others to detour.
 *   4. Repeat until no edge is over-subscribed (legal) or `maxIterations`
 *      is hit (illegal — typically means the design is over-congested).
 *
 * Edge cost for net N at iteration i:
 *
 *   cost(e) = (b_e + h_e) · p_e
 *
 * where b_e is base cost (1), h_e is the history term, p_e is the present
 * congestion multiplier (1 + α · max(0, used − cap)).
 */

export interface Point { x: number; y: number; }
export interface PfNet {
  id: string;
  /** Pin coordinates. The first is the "source", the rest are "sinks". */
  pins: Point[];
}
export interface PathfinderParams {
  nets: PfNet[];
  /** Tile grid resolution. Net coordinates are quantized to this pitch. */
  gridPitch: number;
  /** Chip extent in user units. */
  chipWidth: number;
  chipHeight: number;
  /** Per-edge capacity (default 1). Higher → less congestion pressure. */
  edgeCapacity?: number;
  /** Maximum negotiation rounds. */
  maxIterations?: number;
  /** Present-cost ramp factor per iteration (default 2 — doubles each round). */
  presentRamp?: number;
  /** History-cost increment per round of overflow (default 1). */
  historyIncr?: number;
}

export interface PathfinderResult {
  success: boolean;
  /** Per-net ordered list of grid edges used. */
  routes: { netId: string; edges: { a: Point; b: Point }[]; length: number }[];
  /** Number of edges that remain over-subscribed at exit. */
  overflowEdges: number;
  /** Sum over edges of max(0, used − cap). */
  totalOverflow: number;
  iterations: number;
  /** True ⇔ converged with zero overflow before maxIterations. */
  legal: boolean;
  totalWirelength: number;
  runtime: number;
}

/* --------------------------------------------------------------------- */
/* Grid + edge bookkeeping                                                */
/* --------------------------------------------------------------------- */

interface Grid {
  cols: number;
  rows: number;
  pitch: number;
}

/** Encode an undirected edge between two adjacent grid nodes as a stable key. */
function edgeKey(ax: number, ay: number, bx: number, by: number): string {
  if (ax < bx || (ax === bx && ay < by)) return `${ax},${ay}|${bx},${by}`;
  return `${bx},${by}|${ax},${ay}`;
}

function snap(p: Point, g: Grid): { c: number; r: number } {
  return {
    c: Math.max(0, Math.min(g.cols - 1, Math.round(p.x / g.pitch))),
    r: Math.max(0, Math.min(g.rows - 1, Math.round(p.y / g.pitch))),
  };
}

/* --------------------------------------------------------------------- */
/* Shortest-path (Dijkstra) on the cost grid                              */
/* --------------------------------------------------------------------- */

interface PqNode { c: number; r: number; d: number; }

class MinHeap<T extends { d: number }> {
  private h: T[] = [];
  push(x: T): void {
    this.h.push(x); this.up(this.h.length - 1);
  }
  pop(): T | undefined {
    if (this.h.length === 0) return undefined;
    const top = this.h[0];
    const last = this.h.pop()!;
    if (this.h.length > 0) { this.h[0] = last; this.down(0); }
    return top;
  }
  size(): number { return this.h.length; }
  private up(i: number) {
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.h[p].d > this.h[i].d) { [this.h[p], this.h[i]] = [this.h[i], this.h[p]]; i = p; }
      else break;
    }
  }
  private down(i: number) {
    const n = this.h.length;
    for (;;) {
      const l = 2 * i + 1, r = 2 * i + 2; let m = i;
      if (l < n && this.h[l].d < this.h[m].d) m = l;
      if (r < n && this.h[r].d < this.h[m].d) m = r;
      if (m === i) break;
      [this.h[m], this.h[i]] = [this.h[i], this.h[m]]; i = m;
    }
  }
}

function dijkstra(
  source: { c: number; r: number },
  target: { c: number; r: number },
  edgeCost: (ax: number, ay: number, bx: number, by: number) => number,
  g: Grid,
): { c: number; r: number }[] | null {
  const N = g.cols * g.rows;
  const dist = new Array<number>(N).fill(Infinity);
  const prev = new Array<number>(N).fill(-1);
  const idx = (c: number, r: number) => r * g.cols + c;
  dist[idx(source.c, source.r)] = 0;
  const pq = new MinHeap<PqNode>();
  pq.push({ c: source.c, r: source.r, d: 0 });
  const tgt = idx(target.c, target.r);
  const dx = [1, -1, 0, 0], dy = [0, 0, 1, -1];
  while (pq.size() > 0) {
    const cur = pq.pop()!;
    const u = idx(cur.c, cur.r);
    if (cur.d > dist[u]) continue;
    if (u === tgt) break;
    for (let k = 0; k < 4; k++) {
      const nc = cur.c + dx[k], nr = cur.r + dy[k];
      if (nc < 0 || nc >= g.cols || nr < 0 || nr >= g.rows) continue;
      const w = edgeCost(cur.c, cur.r, nc, nr);
      const nd = cur.d + w;
      const v = idx(nc, nr);
      if (nd < dist[v]) {
        dist[v] = nd;
        prev[v] = u;
        pq.push({ c: nc, r: nr, d: nd });
      }
    }
  }
  if (!isFinite(dist[tgt])) return null;
  const path: { c: number; r: number }[] = [];
  let cur = tgt;
  while (cur !== -1) {
    const r = Math.floor(cur / g.cols);
    const c = cur - r * g.cols;
    path.push({ c, r });
    cur = prev[cur];
  }
  path.reverse();
  return path;
}

/* --------------------------------------------------------------------- */
/* Public entry                                                           */
/* --------------------------------------------------------------------- */

export function pathfinder(params: PathfinderParams): PathfinderResult {
  const start = performance.now();
  const pitch = params.gridPitch;
  const grid: Grid = {
    cols: Math.max(1, Math.ceil(params.chipWidth / pitch) + 1),
    rows: Math.max(1, Math.ceil(params.chipHeight / pitch) + 1),
    pitch,
  };
  const cap = params.edgeCapacity ?? 1;
  const maxIter = params.maxIterations ?? 20;
  const ramp = params.presentRamp ?? 2;
  const histIncr = params.historyIncr ?? 1;

  // Per-edge state: usage count, history penalty.
  const usage = new Map<string, number>();
  const history = new Map<string, number>();

  let routes: PathfinderResult['routes'] = [];
  let overflowEdges = 0, totalOverflow = 0, lastWl = 0;
  let it = 0;
  let presentMul = 1; // grows each iter via `ramp`

  for (it = 0; it < maxIter; it++) {
    // Reset usage at the top of each pass — every net is rerouted.
    usage.clear();
    routes = [];
    lastWl = 0;

    const presentMulSnapshot = presentMul;
    const cost = (ax: number, ay: number, bx: number, by: number): number => {
      const k = edgeKey(ax, ay, bx, by);
      const u = usage.get(k) ?? 0;
      const h = history.get(k) ?? 0;
      const overflow = Math.max(0, u + 1 - cap);
      // base 1 + history penalty, scaled by present-cost (overflow term)
      return (1 + h) * (1 + presentMulSnapshot * overflow);
    };

    for (const net of params.nets) {
      if (net.pins.length < 2) {
        routes.push({ netId: net.id, edges: [], length: 0 });
        continue;
      }
      const snapped = net.pins.map(p => snap(p, grid));
      // Multi-pin nets: route as an MST of pairwise shortest paths
      // (sequential connection: pin[0] → pin[1] → ... → pin[k]).
      const used: { a: Point; b: Point }[] = [];
      let length = 0;
      for (let i = 1; i < snapped.length; i++) {
        const path = dijkstra(snapped[i - 1], snapped[i], cost, grid);
        if (!path) continue;
        for (let s = 0; s + 1 < path.length; s++) {
          const a = path[s], b = path[s + 1];
          const k = edgeKey(a.c, a.r, b.c, b.r);
          usage.set(k, (usage.get(k) ?? 0) + 1);
          used.push({
            a: { x: a.c * pitch, y: a.r * pitch },
            b: { x: b.c * pitch, y: b.r * pitch },
          });
          length += pitch;
        }
      }
      routes.push({ netId: net.id, edges: used, length });
      lastWl += length;
    }

    // Tally overflow + bump history on every still-overflowing edge.
    overflowEdges = 0; totalOverflow = 0;
    for (const [k, u] of usage) {
      if (u > cap) {
        overflowEdges++;
        totalOverflow += u - cap;
        history.set(k, (history.get(k) ?? 0) + histIncr);
      }
    }
    if (overflowEdges === 0) break;
    presentMul *= ramp;
  }

  return {
    success: true,
    routes,
    overflowEdges,
    totalOverflow,
    iterations: Math.min(it + 1, maxIter),
    legal: overflowEdges === 0,
    totalWirelength: lastWl,
    runtime: performance.now() - start,
  };
}
