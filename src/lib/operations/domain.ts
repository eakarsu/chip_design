import type { MetricComparison, SignoffCheck, SpiceMatrixPoint } from './types';

const LOWER_IS_BETTER = /(area|power|drc|violation|congestion|runtime|latency|drop|error|delta)/i;
const HIGHER_IS_BETTER = /(wns|slack|frequency|yield|coverage|passed)/i;

export function compareMetricSets(
  baseline: Record<string, number>,
  candidate: Record<string, number>
): MetricComparison[] {
  const keys = [...new Set([...Object.keys(baseline), ...Object.keys(candidate)])].sort();
  return keys.map((key) => {
    const before = baseline[key];
    const after = candidate[key];
    if (!Number.isFinite(before) || !Number.isFinite(after)) {
      return { key, baseline: before, candidate: after, direction: 'incomparable' };
    }
    const delta = after - before;
    const deltaPct = before === 0 ? undefined : (delta / Math.abs(before)) * 100;
    const lower = LOWER_IS_BETTER.test(key);
    const higher = HIGHER_IS_BETTER.test(key);
    const direction =
      Math.abs(delta) < Number.EPSILON
        ? 'unchanged'
        : lower
          ? delta < 0
            ? 'improved'
            : 'regressed'
          : higher
            ? delta > 0
              ? 'improved'
              : 'regressed'
            : 'incomparable';
    return { key, baseline: before, candidate: after, delta, deltaPct, direction };
  });
}

export function buildYosysFlow(topModule: string, rtlFile = 'design.v'): string {
  if (!/^[A-Za-z_][A-Za-z0-9_$]*$/.test(topModule)) throw new Error('Invalid Verilog top module');
  if (!/^[A-Za-z0-9._-]+\.v$/.test(rtlFile)) throw new Error('Invalid RTL file name');
  return [
    `read_verilog /input/${rtlFile}`,
    `hierarchy -check -top ${topModule}`,
    'proc',
    'flatten',
    'opt',
    'memory',
    'opt',
    'techmap',
    'opt',
    'check',
    'tee -o /output/synthesis-stat.txt stat',
    'write_json /output/netlist.json',
    'write_verilog -noattr /output/netlist.v',
    '',
  ].join('\n');
}

export function buildOrfsConfig(input: {
  topModule: string;
  rtlFile?: string;
  sdcFile?: string;
  platform?: string;
  coreUtilization?: number;
  placeDensity?: number;
}): string {
  const topModule = input.topModule;
  if (!/^[A-Za-z_][A-Za-z0-9_$]*$/.test(topModule)) throw new Error('Invalid Verilog top module');
  const platform = input.platform ?? 'sky130hd';
  if (!/^[A-Za-z0-9_-]+$/.test(platform)) throw new Error('Invalid ORFS platform');
  const utilization = Math.min(80, Math.max(10, input.coreUtilization ?? 40));
  const density = Math.min(0.85, Math.max(0.2, input.placeDensity ?? 0.55));
  return [
    `export DESIGN_NAME = ${topModule}`,
    `export PLATFORM = ${platform}`,
    `export VERILOG_FILES = /input/${input.rtlFile ?? 'design.v'}`,
    `export SDC_FILE = /input/${input.sdcFile ?? 'constraint.sdc'}`,
    `export CORE_UTILIZATION = ${utilization}`,
    'export TNS_END_PERCENT = 100',
    `export PLACE_DENSITY = ${density}`,
    '',
  ].join('\n');
}

export function buildSpiceMatrix(input: {
  processes: string[];
  voltages: number[];
  temperatures: number[];
  monteCarloSeeds?: number;
}): SpiceMatrixPoint[] {
  const seeds = Math.min(1000, Math.max(1, input.monteCarloSeeds ?? 1));
  const points: SpiceMatrixPoint[] = [];
  for (const process of input.processes) {
    for (const voltage of input.voltages) {
      for (const temperature of input.temperatures) {
        for (let seed = 1; seed <= seeds; seed += 1) {
          points.push({
            id: `${process}-${voltage}-${temperature}-${seed}`,
            process,
            voltage,
            temperature,
            seed: seeds > 1 ? seed : undefined,
            status: 'queued',
          });
          if (points.length > 10_000) throw new Error('SPICE matrix exceeds 10,000 jobs');
        }
      }
    }
  }
  return points;
}

export function readinessScore(checks: SignoffCheck[]): number {
  if (!checks.length) return 0;
  const score = checks.reduce(
    (sum, check) => sum + (check.state === 'pass' ? 1 : check.state === 'waived' ? 0.5 : 0),
    0
  );
  return Math.round((score / checks.length) * 100);
}
