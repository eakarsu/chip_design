/**
 * Wire-length / HPWL report.
 *
 * Given a list of nets — each net is a set of (x, y) terminal points — we
 * compute the **half-perimeter wire length** (HPWL): the bounding-box width
 * plus height of all terminals. HPWL is the standard cheap proxy for the
 * routed wire length used by every analytical placer (RePlAce, eDraw, etc.)
 * and is always a lower bound on the actual routed length.
 *
 * Each net can carry an optional `layerHint` (e.g. "M2") so we can break the
 * total down per-layer in the UI. Nets with one or zero terminals contribute
 * zero length but still appear in the report (zero-pin / dangling nets are
 * a real lint signal).
 */
export interface NetTerm {
  /** Terminal x in microns. */
  x: number;
  /** Terminal y in microns. */
  y: number;
  /** Optional label — instance/pin name or top-level pin. */
  label?: string;
}

export interface WireNet {
  name: string;
  terminals: NetTerm[];
  /** Suggested routing layer for aggregation in the report. */
  layerHint?: string;
}

export interface NetReport {
  name: string;
  numTerms: number;
  hpwl: number;
  bboxW: number;
  bboxH: number;
  layer?: string;
  /** Manhattan distance between the two extreme terminals (sanity check). */
  spanX: number;
  spanY: number;
}

export interface LayerReport {
  layer: string;
  nets: number;
  totalHpwl: number;
}

export interface WireLengthResult {
  perNet: NetReport[];
  perLayer: LayerReport[];
  totalNets: number;
  totalHpwl: number;
  /** HPWL of the longest single net — useful as a max-fanout heuristic. */
  maxNetHpwl: number;
  /** Average terminals per net. */
  avgFanout: number;
  warnings: string[];
}

export function computeWireLength(nets: WireNet[]): WireLengthResult {
  const perNet: NetReport[] = [];
  const layerMap = new Map<string, LayerReport>();
  const warnings: string[] = [];
  let totalHpwl = 0;
  let totalTerms = 0;
  let maxNetHpwl = 0;

  for (const net of nets) {
    if (!net.name) {
      warnings.push('found net without a name — skipped');
      continue;
    }
    const terms = net.terminals ?? [];
    if (terms.length < 2) {
      perNet.push({
        name: net.name, numTerms: terms.length, hpwl: 0,
        bboxW: 0, bboxH: 0, layer: net.layerHint, spanX: 0, spanY: 0,
      });
      if (terms.length === 0) warnings.push(`net "${net.name}" has zero terminals`);
      else warnings.push(`net "${net.name}" has only one terminal — dangling`);
      totalTerms += terms.length;
      continue;
    }
    let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
    for (const t of terms) {
      if (t.x < xMin) xMin = t.x;
      if (t.x > xMax) xMax = t.x;
      if (t.y < yMin) yMin = t.y;
      if (t.y > yMax) yMax = t.y;
    }
    const w = xMax - xMin;
    const h = yMax - yMin;
    const hpwl = w + h;
    perNet.push({
      name: net.name, numTerms: terms.length, hpwl,
      bboxW: w, bboxH: h, layer: net.layerHint, spanX: w, spanY: h,
    });
    totalHpwl += hpwl;
    totalTerms += terms.length;
    if (hpwl > maxNetHpwl) maxNetHpwl = hpwl;

    if (net.layerHint) {
      const lr = layerMap.get(net.layerHint) ??
        { layer: net.layerHint, nets: 0, totalHpwl: 0 };
      lr.nets++;
      lr.totalHpwl += hpwl;
      layerMap.set(net.layerHint, lr);
    }
  }

  const perLayer = Array.from(layerMap.values())
    .sort((a, b) => b.totalHpwl - a.totalHpwl);
  const totalNets = perNet.length;
  const avgFanout = totalNets > 0 ? totalTerms / totalNets : 0;

  return {
    perNet, perLayer, totalNets, totalHpwl, maxNetHpwl, avgFanout, warnings,
  };
}
