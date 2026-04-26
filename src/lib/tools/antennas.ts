/**
 * Antenna-report parser.
 *
 * OpenROAD's `check_antennas` (and historically Magic / Calibre / etc.)
 * dumps per-net antenna-ratio reports — one entry per net, with one or
 * more per-layer ratio lines (PAR = partial antenna ratio, CAR =
 * cumulative antenna ratio). A net is violated if any per-layer ratio
 * exceeds the technology's allowed threshold.
 *
 * The exact text varies between OpenROAD versions and CAD vendors. We
 * support a handful of common shapes:
 *
 *   "Net: <name>"  / "Antenna violation: <name>" / "[VIOLATED] net <name>"
 *
 *   "Layer <name>  PAR: <val> / <limit>  [PASS|FAIL|VIOLATED]"
 *   "<layer>  PAR: <val> ratio  CAR: <val> ratio"
 *
 * The parser collects whatever it can find, defaults to `violated=false`
 * unless an explicit FAIL/VIOLATED token is present, and is forgiving of
 * extra whitespace / banner lines.
 */

export interface AntennaLayerEntry {
  layer: string;
  /** Partial Antenna Ratio. */
  par?: number;
  /** Cumulative Antenna Ratio. */
  car?: number;
  /** PAR / CAR threshold from the rule deck. */
  parLimit?: number;
  carLimit?: number;
  violated: boolean;
}

export interface AntennaNetReport {
  net: string;
  layers: AntennaLayerEntry[];
  /** True if any layer entry is violated. */
  violated: boolean;
  /** Worst (highest) ratio observed across all layers. */
  worstRatio: number;
}

export interface AntennaReport {
  nets: AntennaNetReport[];
  /** Top-line counts. */
  totalNets: number;
  violatedNets: number;
}

const NET_HEAD = /^(?:Antenna violation:|Net:|\[VIOLATED\]\s+net|Net)\s*:?\s*(\S+)/i;

export function parseAntennaReport(stdout: string): AntennaReport {
  const lines = stdout.split(/\r?\n/);
  const nets: AntennaNetReport[] = [];
  let cur: AntennaNetReport | null = null;

  function flush() {
    if (!cur) return;
    cur.violated = cur.layers.some(l => l.violated);
    cur.worstRatio = cur.layers.reduce((m, l) => Math.max(m, l.par ?? 0, l.car ?? 0), 0);
    nets.push(cur);
    cur = null;
  }

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    const head = line.match(NET_HEAD);
    if (head) {
      flush();
      cur = { net: head[1], layers: [], violated: false, worstRatio: 0 };
      continue;
    }
    if (!cur) continue;

    // Layer-level entries — try a couple of common shapes.
    // Shape A: "Layer met1  PAR: 850.0 / 400.0  [FAIL]"
    let m = line.match(/^Layer\s+(\S+)\s+PAR:\s*([\d.eE+-]+)\s*\/\s*([\d.eE+-]+)\s*(?:\[(PASS|FAIL|VIOLATED|OK)\])?/i);
    if (m) {
      const par = Number(m[2]);
      const limit = Number(m[3]);
      const tag = m[4]?.toUpperCase();
      cur.layers.push({
        layer: m[1], par, parLimit: limit,
        violated: tag === 'FAIL' || tag === 'VIOLATED' || (!tag && par > limit),
      });
      continue;
    }
    // Shape B: "met1  PAR: 850.0 ratio  CAR: 1200.0 ratio"
    m = line.match(/^(\S+)\s+PAR:\s*([\d.eE+-]+)\s*ratio(?:\s+CAR:\s*([\d.eE+-]+)\s*ratio)?/i);
    if (m) {
      const par = Number(m[2]);
      const car = m[3] ? Number(m[3]) : undefined;
      const violated = /\b(FAIL|VIOLATED)\b/i.test(line);
      cur.layers.push({ layer: m[1], par, car, violated });
      continue;
    }
    // Shape C: explicit VIOLATED on a per-layer line
    m = line.match(/^Layer\s+(\S+)[\s\S]*\[(VIOLATED|FAIL)\]/i);
    if (m) {
      cur.layers.push({ layer: m[1], violated: true });
      continue;
    }
  }
  flush();

  return {
    nets,
    totalNets: nets.length,
    violatedNets: nets.filter(n => n.violated).length,
  };
}
