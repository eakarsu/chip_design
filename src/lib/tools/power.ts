/**
 * Parser for OpenROAD `report_power` output.
 *
 * Recognised shapes (modern OpenROAD):
 *
 *   Group                  Internal     Switching    Leakage      Total       (%)
 *   --------------------------------------------------------------------------
 *   Sequential             1.23e-3      4.56e-4      7.89e-6      1.69e-3     34.5%
 *   Combinational          5.67e-4      8.91e-4      2.34e-5      1.48e-3     30.2%
 *   Macro                  3.45e-3      6.78e-4      9.01e-5      4.22e-3     ...
 *   Pad                    ...
 *   --------------------------------------------------------------------------
 *   Total                  ...                                    4.91e-3     100.0%
 *
 * Plus per-instance lines (when invoked with `-instance`):
 *
 *   inst_a/CELL  Internal=1.2e-4 Switching=3.4e-5 Leakage=7.8e-7 Total=1.6e-4
 *
 * All numbers are watts.
 */

export interface PowerGroup {
  name: string;
  internal: number;
  switching: number;
  leakage: number;
  total: number;
  /** Fraction of total (0..1). Computed if missing. */
  percent?: number;
}

export interface PowerInstance {
  instance: string;
  cell?: string;
  internal: number;
  switching: number;
  leakage: number;
  total: number;
}

export interface PowerReport {
  groups: PowerGroup[];
  instances: PowerInstance[];
  /** Sum of all group totals (watts). */
  totalPower: number;
  /** Per-component sums (watts). */
  totals: { internal: number; switching: number; leakage: number };
  warnings: string[];
}

const RE_GROUP = /^\s*(Sequential|Combinational|Clock|Macro|Pad|Register|IO|Memory|Other)\s+([\d.eE+-]+)\s+([\d.eE+-]+)\s+([\d.eE+-]+)\s+([\d.eE+-]+)(?:\s+([\d.eE+-]+)%)?\s*$/;
const RE_TOTAL = /^\s*Total\s+(?:([\d.eE+-]+)\s+([\d.eE+-]+)\s+([\d.eE+-]+)\s+)?([\d.eE+-]+)(?:\s+([\d.eE+-]+)%)?\s*$/i;
const RE_INST  = /^([\w/[\]\.\\-]+)\s+(?:cell\s*=\s*(\S+)\s+)?Internal\s*=\s*([\d.eE+-]+)\s+Switching\s*=\s*([\d.eE+-]+)\s+Leakage\s*=\s*([\d.eE+-]+)\s+Total\s*=\s*([\d.eE+-]+)/i;

export function parsePowerReport(stdout: string): PowerReport {
  const groups: PowerGroup[] = [];
  const instances: PowerInstance[] = [];
  const warnings: string[] = [];
  let explicitTotal: number | undefined;

  for (const rawLine of stdout.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+$/g, '');
    if (!line) continue;

    let m: RegExpMatchArray | null;
    if ((m = line.match(RE_GROUP))) {
      const [, name, internal, switching, leakage, total, pct] = m;
      groups.push({
        name,
        internal: Number(internal),
        switching: Number(switching),
        leakage: Number(leakage),
        total: Number(total),
        percent: pct ? Number(pct) / 100 : undefined,
      });
      continue;
    }
    if ((m = line.match(RE_TOTAL)) && /total/i.test(line)) {
      explicitTotal = Number(m[4]);
      continue;
    }
    if ((m = line.match(RE_INST))) {
      const [, instance, cell, internal, switching, leakage, total] = m;
      instances.push({
        instance, cell,
        internal: Number(internal),
        switching: Number(switching),
        leakage: Number(leakage),
        total: Number(total),
      });
      continue;
    }
  }

  // Compute totals from groups (preferred) or instances (fallback).
  const sums = { internal: 0, switching: 0, leakage: 0 };
  let total = 0;
  if (groups.length > 0) {
    for (const g of groups) {
      sums.internal += g.internal;
      sums.switching += g.switching;
      sums.leakage += g.leakage;
      total += g.total;
    }
  } else if (instances.length > 0) {
    for (const i of instances) {
      sums.internal += i.internal;
      sums.switching += i.switching;
      sums.leakage += i.leakage;
      total += i.total;
    }
  }
  if (explicitTotal !== undefined && total === 0) total = explicitTotal;

  // Backfill percent.
  for (const g of groups) {
    if (g.percent === undefined && total > 0) g.percent = g.total / total;
  }

  if (groups.length === 0 && instances.length === 0) {
    warnings.push('No power data recognised in input.');
  }

  return { groups, instances, totalPower: total, totals: sums, warnings };
}

/** Aggregate per-instance results by cell type. */
export function groupByCell(instances: PowerInstance[]): PowerGroup[] {
  const m = new Map<string, PowerGroup>();
  for (const i of instances) {
    const k = i.cell ?? 'unknown';
    let g = m.get(k);
    if (!g) {
      g = { name: k, internal: 0, switching: 0, leakage: 0, total: 0 };
      m.set(k, g);
    }
    g.internal  += i.internal;
    g.switching += i.switching;
    g.leakage   += i.leakage;
    g.total     += i.total;
  }
  let total = 0;
  for (const g of m.values()) total += g.total;
  for (const g of m.values()) g.percent = total > 0 ? g.total / total : 0;
  return [...m.values()].sort((a, b) => b.total - a.total);
}
