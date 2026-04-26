/**
 * Clock-tree synthesis (CTS) report parser.
 *
 * Recognises two complementary input shapes:
 *
 *   1. Summary block — produced by OpenROAD's `report_clock_skew` /
 *      `report_cts`:
 *
 *        Number of Sinks   = 100
 *        Number of Buffers = 23
 *        Max Skew          = 0.150 ns
 *        Avg Skew          = 0.072 ns
 *        Wire length       = 1.234 mm
 *
 *   2. Per-node lines — a (vendor-neutral) shape we use to draw the actual
 *      tree:
 *
 *        root:   clk_root x=500 y=500
 *        buffer: BUF_0 parent=clk_root x=400 y=400 delay=0.10
 *        buffer: BUF_1 parent=BUF_0    x=300 y=300 delay=0.07
 *        sink:   reg0/CK parent=BUF_1 x=290 y=290 latency=0.35
 *
 * The visualiser uses the tree from (2) plus the metrics from (1).
 */

export type CtsNodeKind = 'root' | 'buffer' | 'sink';

export interface CtsNode {
  id: string;
  kind: CtsNodeKind;
  parent?: string;
  x?: number;
  y?: number;
  /** Insertion delay of this node (ns). */
  delay?: number;
  /** Total latency from root to this sink (ns). */
  latency?: number;
}

export interface CtsSummary {
  numSinks?: number;
  numBuffers?: number;
  /** Max skew in ns. */
  maxSkew?: number;
  /** Average skew in ns. */
  avgSkew?: number;
  /** Wirelength in user units (mm). */
  wirelength?: number;
}

export interface CtsReport {
  summary: CtsSummary;
  nodes: CtsNode[];
  warnings: string[];
}

const RE_NUM_SINKS  = /Number\s+of\s+Sinks\s*=\s*(\d+)/i;
const RE_NUM_BUFS   = /Number\s+of\s+Buffers\s*=\s*(\d+)/i;
const RE_MAX_SKEW   = /Max\s+Skew\s*=\s*([\d.]+)\s*(ns|ps)?/i;
const RE_AVG_SKEW   = /Avg\s+Skew\s*=\s*([\d.]+)\s*(ns|ps)?/i;
const RE_WIRELEN    = /Wire\s+length\s*=\s*([\d.]+)\s*(mm|um|µm)?/i;
const RE_NODE       = /^(root|buffer|sink)\s*:\s*(\S+)\s*(.*)$/i;
const RE_KV         = /(\w+)\s*=\s*([\w./-]+)/g;

function toNs(value: number, unit: string | undefined): number {
  if (!unit) return value;
  return unit.toLowerCase() === 'ps' ? value / 1000 : value;
}

function toMm(value: number, unit: string | undefined): number {
  if (!unit) return value;
  const u = unit.toLowerCase();
  if (u === 'um' || u === 'µm') return value / 1000;
  return value;
}

export function parseCtsReport(stdout: string): CtsReport {
  const summary: CtsSummary = {};
  const nodes: CtsNode[] = [];
  const warnings: string[] = [];

  for (const rawLine of stdout.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    let m: RegExpMatchArray | null;
    if ((m = line.match(RE_NUM_SINKS))) { summary.numSinks = Number(m[1]); continue; }
    if ((m = line.match(RE_NUM_BUFS)))  { summary.numBuffers = Number(m[1]); continue; }
    if ((m = line.match(RE_MAX_SKEW)))  { summary.maxSkew = toNs(Number(m[1]), m[2]); continue; }
    if ((m = line.match(RE_AVG_SKEW)))  { summary.avgSkew = toNs(Number(m[1]), m[2]); continue; }
    if ((m = line.match(RE_WIRELEN)))   { summary.wirelength = toMm(Number(m[1]), m[2]); continue; }

    const n = line.match(RE_NODE);
    if (n) {
      const [, kind, id, rest] = n;
      const node: CtsNode = { id, kind: kind.toLowerCase() as CtsNodeKind };
      const kvs = (rest ?? '').matchAll(RE_KV);
      for (const kv of kvs) {
        const [, key, val] = kv;
        switch (key.toLowerCase()) {
          case 'parent':  node.parent = val; break;
          case 'x':       node.x = Number(val); break;
          case 'y':       node.y = Number(val); break;
          case 'delay':   node.delay = Number(val); break;
          case 'latency': node.latency = Number(val); break;
        }
      }
      nodes.push(node);
      continue;
    }
  }

  // Validation passes:
  const ids = new Set(nodes.map(n => n.id));
  for (const n of nodes) {
    if (n.parent && !ids.has(n.parent)) {
      warnings.push(`node ${n.id} references missing parent ${n.parent}`);
    }
  }
  const roots = nodes.filter(n => n.kind === 'root');
  if (nodes.length > 0 && roots.length === 0) warnings.push('tree has no root');
  if (roots.length > 1) warnings.push(`tree has ${roots.length} roots (expected 1)`);

  return { summary, nodes, warnings };
}

/**
 * Compute per-sink latency analytics from a parsed tree. If sinks already
 * carry an explicit `latency`, we leave it as-is; otherwise we sum buffer
 * `delay`s along the path from root.
 */
export interface CtsAnalytics {
  /** Sink id → latency (ns). */
  latencyBySink: Map<string, number>;
  minLatency: number;
  maxLatency: number;
  /** Computed skew = max − min. */
  computedSkew: number;
}

export function analyseCts(report: CtsReport): CtsAnalytics {
  const byId = new Map<string, CtsNode>();
  for (const n of report.nodes) byId.set(n.id, n);

  const latencyBySink = new Map<string, number>();
  let lo = Infinity, hi = -Infinity;
  for (const n of report.nodes) {
    if (n.kind !== 'sink') continue;
    let lat = n.latency;
    if (lat === undefined) {
      lat = 0;
      let cur: CtsNode | undefined = n;
      const seen = new Set<string>();
      while (cur && cur.parent && !seen.has(cur.id)) {
        seen.add(cur.id);
        const parent = byId.get(cur.parent);
        if (!parent) break;
        lat += parent.delay ?? 0;
        cur = parent;
      }
    }
    latencyBySink.set(n.id, lat);
    if (lat < lo) lo = lat;
    if (lat > hi) hi = lat;
  }
  if (latencyBySink.size === 0) { lo = 0; hi = 0; }

  return {
    latencyBySink,
    minLatency: lo,
    maxLatency: hi,
    computedSkew: hi - lo,
  };
}

/**
 * Auto-layout a CTS tree by walking the children: x = midpoint of children,
 * y = depth × spacing. Used when the input lacks coordinates.
 */
export function layoutCtsTree(
  report: CtsReport,
  opts: { width?: number; depthSpacing?: number } = {},
): Map<string, { x: number; y: number }> {
  const width = opts.width ?? 800;
  const depthSpacing = opts.depthSpacing ?? 80;
  const byId = new Map<string, CtsNode>();
  for (const n of report.nodes) byId.set(n.id, n);
  const children = new Map<string, string[]>();
  for (const n of report.nodes) {
    if (n.parent) {
      const arr = children.get(n.parent) ?? [];
      arr.push(n.id);
      children.set(n.parent, arr);
    }
  }
  const out = new Map<string, { x: number; y: number }>();
  const root = report.nodes.find(n => n.kind === 'root');
  if (!root) return out;

  // First pass: compute "leaf order" so each subtree gets a contiguous
  // x-range. Second pass: assign x = mid of subtree, y = depth.
  const leafOrder: string[] = [];
  function dfs(id: string) {
    const kids = children.get(id) ?? [];
    if (kids.length === 0) { leafOrder.push(id); return; }
    for (const k of kids) dfs(k);
  }
  dfs(root.id);
  const slot = new Map<string, number>();
  leafOrder.forEach((id, i) => slot.set(id, i));
  const dx = width / Math.max(1, leafOrder.length);

  function placeAt(id: string, depth: number): { mid: number } {
    const kids = children.get(id) ?? [];
    if (kids.length === 0) {
      const x = (slot.get(id)! + 0.5) * dx;
      const y = 30 + depth * depthSpacing;
      out.set(id, { x, y });
      return { mid: x };
    }
    const placements = kids.map(k => placeAt(k, depth + 1).mid);
    const mid = placements.reduce((a, b) => a + b, 0) / placements.length;
    out.set(id, { x: mid, y: 30 + depth * depthSpacing });
    return { mid };
  }
  placeAt(root.id, 0);
  return out;
}
