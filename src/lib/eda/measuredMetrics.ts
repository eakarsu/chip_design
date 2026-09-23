import fs from 'fs';
import path from 'path';

/** Values are read from retained tool reports, never from a model response. */
export type MeasuredMetrics = Record<string, number>;

function regularFile(filename: string, maxBytes: number, minBytes = 0): boolean {
  try {
    const stat = fs.lstatSync(filename);
    return stat.isFile() && !stat.isSymbolicLink() && stat.size >= minBytes && stat.size <= maxBytes;
  } catch {
    return false;
  }
}

function finite(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readJsonMetrics(filename: string): MeasuredMetrics {
  if (!regularFile(filename, 1024 * 1024)) return {};
  const source = JSON.parse(fs.readFileSync(filename, 'utf8')) as Record<string, unknown>;
  return Object.fromEntries(Object.entries(source).filter((entry): entry is [string, number] => finite(entry[1]) !== undefined));
}

/**
 * ORFS puts final metrics in logs/6_report.json and detailed-route markers in
 * reports/5_route_drc.rpt. An absent report or final GDS is incomplete evidence.
 */
export function readMeasuredMetrics(outputDirectory: string, kind: 'openroad' | 'other'): MeasuredMetrics {
  if (kind !== 'openroad') return readJsonMetrics(path.join(outputDirectory, 'metrics.json'));
  const reportPath = path.join(outputDirectory, 'logs', '6_report.json');
  const drcPath = path.join(outputDirectory, 'reports', '5_route_drc.rpt');
  const gdsPath = path.join(outputDirectory, 'results', '6_final.gds');
  if (!regularFile(reportPath, 1024 * 1024, 1) || !regularFile(drcPath, 1024 * 1024) || !regularFile(gdsPath, 250 * 1024 * 1024, 1)) return {};
  const report = readJsonMetrics(reportPath);
  const keys = {
    dieAreaUm2: 'finish__design__die__area',
    powerMw: 'finish__power__total',
    fmaxHz: 'finish__timing__fmax',
    setupWnsNs: 'finish__timing__setup__ws',
    holdWnsNs: 'finish__timing__hold__ws',
    setupTnsNs: 'finish__timing__setup__tns',
    holdTnsNs: 'finish__timing__hold__tns',
    flowErrors: 'finish__flow__errors__count',
  } as const;
  if (Object.values(keys).some((key) => finite(report[key]) === undefined)) return {};
  const drc = fs.readFileSync(drcPath, 'utf8');
  // A zero-violation ORFS report is empty. Any nonempty content is conservatively
  // treated as at least one violation rather than interpreted as a pass.
  const drcViolations = drc.trim() ? Math.max(1, drc.trim().split(/\r?\n/).length) : 0;
  return {
    dieAreaUm2: report[keys.dieAreaUm2],
    powerMw: report[keys.powerMw] * 1000,
    fmaxMHz: report[keys.fmaxHz] / 1_000_000,
    setupWnsNs: report[keys.setupWnsNs],
    holdWnsNs: report[keys.holdWnsNs],
    setupTnsNs: report[keys.setupTnsNs],
    holdTnsNs: report[keys.holdTnsNs],
    flowErrors: report[keys.flowErrors],
    drcViolations,
  };
}
