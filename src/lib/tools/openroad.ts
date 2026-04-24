/**
 * OpenROAD subprocess wrapper.
 *
 * OpenROAD is driven by TCL scripts. We let callers provide either a full
 * script or a concise list of high-level steps (read_lef, read_def,
 * global_placement, detailed_placement, ...), then parse the stdout for
 * canonical report strings like "HPWL:", "Total power:", etc.
 *
 * As with the Yosys wrapper, when the binary is absent we fall back to the
 * in-repo algorithms so the flow still returns a meaningful report.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

import path from 'path';
import os from 'os';
import { promises as fs } from 'fs';
import { findOnPath, runBin, tail } from './yosys';
import { parseLef } from '@/lib/parsers/lef';
import { parseDef } from '@/lib/parsers/def';
import { runRePlAce } from '@/lib/algorithms/replace';
import type { Cell, Net } from '@/types/algorithms';

export type OpenROADStep =
  | { kind: 'read_lef'; path: string }
  | { kind: 'read_def'; path: string }
  | { kind: 'read_liberty'; path: string }
  | { kind: 'global_placement'; density?: number }
  | { kind: 'detailed_placement' }
  | { kind: 'global_route' }
  | { kind: 'detailed_route' }
  | { kind: 'write_def'; path: string }
  | { kind: 'report_power' }
  | { kind: 'report_wirelength' }
  | { kind: 'raw_tcl'; tcl: string };

export interface OpenROADInput {
  lefContent?: string;
  defContent?: string;
  libertyContent?: string;
  /** High-level steps. Ignored if `tclScript` is provided. */
  steps?: OpenROADStep[];
  /** Fully-formed TCL script. Takes precedence over `steps`. */
  tclScript?: string;
  /** Override binary path lookup. Pass `null` to force fallback. */
  binaryPath?: string | null;
  /** Force the fallback even if OpenROAD is available. */
  forceFallback?: boolean;
  /** Per-flow timeout (ms). Default 10 min. */
  timeoutMs?: number;
}

export interface OpenROADReport {
  ranReal: boolean;
  /** Key → value pairs extracted from OpenROAD's stdout. */
  metrics: Record<string, number>;
  stdoutTail: string;
  stderrTail: string;
  exitCode: number | null;
  /** If the fallback ran global placement, the final cell positions. */
  placedCells?: Cell[];
}

export class OpenROADError extends Error { constructor(msg: string) { super(msg); } }

export async function runOpenROAD(input: OpenROADInput): Promise<OpenROADReport> {
  if (input.forceFallback) return fallback(input);
  const bin = input.binaryPath === undefined ? await findOnPath('openroad') : input.binaryPath;
  if (!bin) return fallback(input);

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'openroad-'));
  const assetPaths: Record<string, string> = {};
  try {
    if (input.lefContent)     { assetPaths.lef = path.join(dir, 'lib.lef');    await fs.writeFile(assetPaths.lef, input.lefContent); }
    if (input.defContent)     { assetPaths.def = path.join(dir, 'design.def'); await fs.writeFile(assetPaths.def, input.defContent); }
    if (input.libertyContent) { assetPaths.lib = path.join(dir, 'lib.lib');    await fs.writeFile(assetPaths.lib, input.libertyContent); }

    const tcl = input.tclScript ?? stepsToTcl(input.steps ?? [], assetPaths);
    const tclPath = path.join(dir, 'flow.tcl');
    await fs.writeFile(tclPath, tcl);

    const { stdout, stderr, code } = await runBin(bin, ['-no_init', tclPath]);
    return {
      ranReal: true,
      metrics: parseMetrics(stdout),
      stdoutTail: tail(stdout),
      stderrTail: tail(stderr),
      exitCode: code,
    };
  } catch (err) {
    const fb = await fallback(input);
    return { ...fb, stderrTail: String(err).slice(-2000) };
  } finally {
    void fs.rm(dir, { recursive: true, force: true }).catch(() => { /* noop */ });
  }
}

function stepsToTcl(steps: OpenROADStep[], assetPaths: Record<string, string>): string {
  const lines: string[] = [];
  for (const s of steps) {
    switch (s.kind) {
      case 'read_lef':     lines.push(`read_lef ${JSON.stringify(s.path ?? assetPaths.lef)}`); break;
      case 'read_def':     lines.push(`read_def ${JSON.stringify(s.path ?? assetPaths.def)}`); break;
      case 'read_liberty': lines.push(`read_liberty ${JSON.stringify(s.path ?? assetPaths.lib)}`); break;
      case 'global_placement':
        lines.push(`global_placement -density ${s.density ?? 0.7}`); break;
      case 'detailed_placement': lines.push(`detailed_placement`); break;
      case 'global_route':       lines.push(`global_route`); break;
      case 'detailed_route':     lines.push(`detailed_route`); break;
      case 'write_def':          lines.push(`write_def ${JSON.stringify(s.path)}`); break;
      case 'report_power':       lines.push(`report_power`); break;
      case 'report_wirelength':  lines.push(`report_wirelength`); break;
      case 'raw_tcl':            lines.push(s.tcl); break;
    }
  }
  lines.push('exit');
  return lines.join('\n') + '\n';
}

/** Extract well-known metric lines from OpenROAD stdout. */
export function parseMetrics(stdout: string): Record<string, number> {
  const out: Record<string, number> = {};
  const patterns: [string, RegExp][] = [
    ['hpwl',         /HPWL\s*:\s*([\d.eE+-]+)/],
    ['wns',          /Worst Negative Slack\s*:\s*(-?[\d.eE+-]+)/],
    ['tns',          /Total Negative Slack\s*:\s*(-?[\d.eE+-]+)/],
    ['total_power',  /Total Power[^\n]*?([\d.eE+-]+)\s*(?:W|mW|µW)?/],
    ['leakage',      /Leakage[^\n]*?([\d.eE+-]+)/],
    ['overflow',     /Overflow\s*:\s*([\d.eE+-]+)/],
    ['instances',    /Number of instances\s*:\s*(\d+)/],
    ['nets',         /Number of nets\s*:\s*(\d+)/],
  ];
  for (const [key, rx] of patterns) {
    const m = stdout.match(rx);
    if (m) out[key] = Number(m[1]);
  }
  return out;
}

/**
 * Fallback: if we have DEF+LEF and the user asked for placement, run the
 * in-repo RePlAce-style placer. Otherwise return an empty report with
 * ranReal=false. Callers branch on ranReal to surface which path ran.
 */
async function fallback(input: OpenROADInput): Promise<OpenROADReport> {
  const steps = input.steps ?? [];
  const wantsPlacement = steps.some(s => s.kind === 'global_placement');
  const metrics: Record<string, number> = {};
  let placedCells: Cell[] | undefined;

  if (wantsPlacement && input.lefContent && input.defContent) {
    try {
      const lef = parseLef(input.lefContent);
      const def = parseDef(input.defContent);
      const dbu = def.units?.dbuPerMicron ?? 1;
      const die = def.dieArea?.points;
      const W = die ? (die[1]?.x ?? 100000) / dbu : 1000;
      const H = die ? (die[1]?.y ?? 100000) / dbu : 1000;

      const macroSize = new Map(lef.macros.map(m => [m.name, m.size]));
      const cells: Cell[] = def.components.map(c => {
        const sz = macroSize.get(c.macro) ?? { width: 1, height: 1 };
        return {
          id: c.name, name: c.name, width: sz.width, height: sz.height,
          position: { x: (c.x ?? 0) / dbu, y: (c.y ?? 0) / dbu },
          pins: [], type: 'standard' as const,
        };
      });
      // Build nets from DEF; we don't have pin-on-cell positions so we
      // just use cell centroids implicitly through the placer.
      const nets: Net[] = def.nets.map(n => ({
        id: n.name, name: n.name,
        pins: n.connections.map(c => `${c.component}.${c.pin}`),
        weight: 1,
      }));
      const step = steps.find(s => s.kind === 'global_placement') as Extract<OpenROADStep, { kind: 'global_placement' }>;
      const res = runRePlAce(cells, nets, {
        chipWidth: W, chipHeight: H,
        iterations: 150,
        lambda: step.density ? (1 - step.density) * 0.1 : 0.05,
        seed: 1,
      });
      placedCells = res.cells;
      metrics.hpwl = res.totalWirelength;
      metrics.overflow = res.overlap;
      metrics.instances = cells.length;
      metrics.nets = nets.length;
    } catch (err) {
      metrics.instances = 0;
    }
  }

  return {
    ranReal: false,
    metrics,
    placedCells,
    stdoutTail: `# fallback run — openroad binary not available\n# metrics: ${JSON.stringify(metrics)}\n`,
    stderrTail: '',
    exitCode: null,
  };
}
