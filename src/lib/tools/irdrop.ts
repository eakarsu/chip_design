/**
 * Parser for OpenROAD `analyze_power_grid` / `report_voltage` reports.
 *
 * Two recognised shapes:
 *
 *   1. Per-instance rows — what we render as a heatmap:
 *
 *        Instance         Layer    Voltage   IR_drop
 *        inst_1/VDD       metal4   0.8950    0.0050
 *        inst_2/VDD       metal4   0.8910    0.0090
 *
 *      Coordinates may optionally be carried in trailing columns:
 *      "X Y" (microns) — emitted by OpenROAD when invoked with
 *      `-instance_voltage_files`.
 *
 *   2. Per-net summary lines:
 *
 *        Net VDD: max IR drop = 0.0250 V at inst_5/VDD, mean = 0.0080 V
 *        Net VSS: max IR drop = 0.0150 V, mean = 0.0040 V
 *
 *  We pull out both into a single report. The viewer uses the per-instance
 *  rows to paint the heatmap and the summary to drive its dashboard.
 */

export interface IRInstance {
  instance: string;
  layer?: string;
  voltage: number;
  drop: number;
  /** In design microns; absent if the report didn't carry coords. */
  x?: number;
  y?: number;
}

export interface IRNetSummary {
  net: string;
  maxDrop: number;
  meanDrop?: number;
  worstInstance?: string;
}

export interface IRReport {
  instances: IRInstance[];
  nets: IRNetSummary[];
  /** Worst per-instance drop (V). */
  worstDrop: number;
  /** Mean per-instance drop (V). */
  meanDrop: number;
  warnings: string[];
}

// "inst_1/VDD   metal4   0.8950   0.0050"  (optional X Y suffix)
const RE_INST = /^\s*([\w/[\]\.\\-]+)\s+([A-Za-z][\w]*)\s+([\d.]+)\s+([\d.]+)(?:\s+([-\d.]+)\s+([-\d.]+))?\s*$/;
// "Net VDD: max IR drop = 0.0250 V at inst_5/VDD, mean = 0.0080 V"
const RE_NET  = /Net\s+(\S+)\s*:\s*max\s+IR\s*drop\s*=\s*([\d.]+)\s*V?\s*(?:at\s+([\w/[\]\.\\-]+))?\s*(?:,\s*mean\s*=\s*([\d.]+)\s*V?)?/i;

export function parseIRReport(stdout: string): IRReport {
  const instances: IRInstance[] = [];
  const nets: IRNetSummary[] = [];
  const warnings: string[] = [];

  for (const rawLine of stdout.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (/^Instance\b.*Layer\b.*Voltage\b/i.test(line)) continue; // header
    if (/^[-=]{3,}/.test(line)) continue; // separator

    const ni = line.match(RE_NET);
    if (ni) {
      nets.push({
        net: ni[1],
        maxDrop: Number(ni[2]),
        worstInstance: ni[3],
        meanDrop: ni[4] !== undefined ? Number(ni[4]) : undefined,
      });
      continue;
    }

    const im = line.match(RE_INST);
    if (im) {
      const [, instance, layer, voltage, drop, x, y] = im;
      instances.push({
        instance, layer,
        voltage: Number(voltage),
        drop: Number(drop),
        x: x !== undefined ? Number(x) : undefined,
        y: y !== undefined ? Number(y) : undefined,
      });
      continue;
    }
  }

  let worst = 0, sum = 0;
  for (const i of instances) {
    if (i.drop > worst) worst = i.drop;
    sum += i.drop;
  }
  const mean = instances.length > 0 ? sum / instances.length : 0;

  if (instances.length === 0 && nets.length === 0) {
    warnings.push('No IR-drop data recognised in input.');
  }

  return { instances, nets, worstDrop: worst, meanDrop: mean, warnings };
}

/**
 * Bin instances onto a regular grid for heatmap rendering. We track:
 *   - the worst (max) drop per cell — the metric designers care about,
 *   - the count of instances per cell — for tooltip detail.
 */
export interface IRGrid {
  cols: number; rows: number;
  /** [row][col] worst drop in cell, 0 if empty. */
  drop: number[][];
  /** [row][col] instance count. */
  count: number[][];
  bbox: { xl: number; yl: number; xh: number; yh: number };
}

export function rasteriseIR(instances: IRInstance[], cols: number, rows: number): IRGrid | null {
  const placed = instances.filter(i => i.x !== undefined && i.y !== undefined);
  if (placed.length === 0) return null;
  let xl = Infinity, yl = Infinity, xh = -Infinity, yh = -Infinity;
  for (const i of placed) {
    if (i.x! < xl) xl = i.x!;
    if (i.x! > xh) xh = i.x!;
    if (i.y! < yl) yl = i.y!;
    if (i.y! > yh) yh = i.y!;
  }
  const w = Math.max(1e-9, xh - xl), h = Math.max(1e-9, yh - yl);
  const drop: number[][] = Array.from({ length: rows }, () => new Array(cols).fill(0));
  const count: number[][] = Array.from({ length: rows }, () => new Array(cols).fill(0));
  for (const i of placed) {
    const c = Math.min(cols - 1, Math.max(0, Math.floor(((i.x! - xl) / w) * cols)));
    const r = Math.min(rows - 1, Math.max(0, Math.floor(((i.y! - yl) / h) * rows)));
    if (i.drop > drop[r][c]) drop[r][c] = i.drop;
    count[r][c]++;
  }
  return { cols, rows, drop, count, bbox: { xl, yl, xh, yh } };
}

/** 5-stop heat ramp matching the legacy /ir-drop page. */
export function irColor(t: number): string {
  const stops = [
    [20, 30, 80],
    [30, 130, 200],
    [70, 200, 130],
    [240, 220, 70],
    [220, 60, 40],
  ];
  const x = Math.max(0, Math.min(1, t)) * (stops.length - 1);
  const i = Math.floor(x);
  const f = x - i;
  const a = stops[i];
  const b = stops[Math.min(i + 1, stops.length - 1)];
  return `rgb(${Math.round(a[0]*(1-f)+b[0]*f)},${Math.round(a[1]*(1-f)+b[1]*f)},${Math.round(a[2]*(1-f)+b[2]*f)})`;
}
