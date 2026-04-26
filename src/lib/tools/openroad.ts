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
  /** TritonCTS clock-tree synthesis. Optional buffer-cell list and root clock. */
  | { kind: 'clock_tree_synthesis'; bufferList?: string[]; rootBuffer?: string; clockNet?: string }
  /** repair_timing — fixes setup or hold violations. */
  | { kind: 'repair_timing'; mode?: 'setup' | 'hold' | 'both'; slackMargin?: number }
  /** Static-timing report (OpenSTA). `pathCount` defaults to 5. */
  | { kind: 'report_checks'; pathCount?: number; pathDelay?: 'min' | 'max' | 'min_max' }
  /** Design-area / utilization report. */
  | { kind: 'report_design_area' }
  /** I/O pin placement (place_pins). Layers must be supplied for a real run. */
  | { kind: 'pin_placement'; horLayers?: string[]; verLayers?: string[] }
  /** Power/ground connection: glue VDD/VSS pins to the global power nets. */
  | {
      kind: 'add_global_connection';
      net: string;
      pinPattern: string;
      power?: boolean;
      ground?: boolean;
      instPattern?: string;
    }
  /** Floorplanning — sets the die / core area. */
  | {
      kind: 'initialize_floorplan';
      utilization?: number;          // 0–1 fraction
      aspectRatio?: number;
      coreSpace?: number;            // µm
      site?: string;                  // e.g. "FreePDK45_38x28_10R_NP_162NW_34O"
      dieArea?: [number, number, number, number]; // [llx, lly, urx, ury] µm
    }
  /** Power/ground grid generation (PDN). */
  | { kind: 'pdngen'; configFile?: string }
  /** Tap-cell / well-tap insertion. */
  | { kind: 'tapcell'; distance?: number; tapcellMaster?: string; endcapMaster?: string }
  /** Macro placement (TritonMacroPlacer / RTLMP). */
  | { kind: 'macro_placement'; halo?: [number, number]; channel?: [number, number] }
  /** Post-CTS / generic design repair (buffering, sizing). */
  | { kind: 'repair_design'; maxWireLength?: number; slewMargin?: number; capMargin?: number }
  /** Antenna-rule violation check / repair. */
  | { kind: 'check_antennas'; reportFile?: string }
  | { kind: 'repair_antennas'; iterations?: number; ratioMargin?: number }
  /** Write final layout. KLayout's gdsout is the typical writer; OpenROAD also has a built-in. */
  | { kind: 'write_gds'; path: string }
  /** Reports specific to clocking & timing. */
  | { kind: 'report_clock_skew' }
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

export function stepsToTcl(steps: OpenROADStep[], assetPaths: Record<string, string> = {}): string {
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

      case 'clock_tree_synthesis': {
        const args: string[] = [];
        if (s.bufferList?.length) args.push(`-buf_list {${s.bufferList.join(' ')}}`);
        if (s.rootBuffer)         args.push(`-root_buf ${s.rootBuffer}`);
        if (s.clockNet)           args.push(`-clk_nets {${s.clockNet}}`);
        lines.push(`clock_tree_synthesis ${args.join(' ')}`.trim());
        break;
      }
      case 'repair_timing': {
        const mode = s.mode ?? 'both';
        const margin = s.slackMargin != null ? ` -slack_margin ${s.slackMargin}` : '';
        if (mode === 'both') {
          lines.push(`repair_timing -setup${margin}`);
          lines.push(`repair_timing -hold${margin}`);
        } else {
          lines.push(`repair_timing -${mode}${margin}`);
        }
        break;
      }
      case 'report_checks': {
        const args: string[] = [];
        if (s.pathCount) args.push(`-path_count ${s.pathCount}`);
        if (s.pathDelay) args.push(`-path_delay ${s.pathDelay}`);
        lines.push(`report_checks ${args.join(' ')}`.trim());
        break;
      }
      case 'report_design_area':
        lines.push(`report_design_area`); break;
      case 'pin_placement': {
        const args: string[] = [];
        if (s.horLayers?.length) args.push(`-hor_layers {${s.horLayers.join(' ')}}`);
        if (s.verLayers?.length) args.push(`-ver_layers {${s.verLayers.join(' ')}}`);
        lines.push(`place_pins ${args.join(' ')}`.trim());
        break;
      }
      case 'add_global_connection': {
        const args = [
          `-net ${s.net}`,
          `-pin_pattern ${JSON.stringify(s.pinPattern)}`,
        ];
        if (s.instPattern) args.push(`-inst_pattern ${JSON.stringify(s.instPattern)}`);
        if (s.power)  args.push('-power');
        if (s.ground) args.push('-ground');
        lines.push(`add_global_connection ${args.join(' ')}`);
        break;
      }

      case 'initialize_floorplan': {
        const args: string[] = [];
        if (s.utilization != null)  args.push(`-utilization ${s.utilization}`);
        if (s.aspectRatio != null)  args.push(`-aspect_ratio ${s.aspectRatio}`);
        if (s.coreSpace != null)    args.push(`-core_space ${s.coreSpace}`);
        if (s.site)                  args.push(`-site ${s.site}`);
        if (s.dieArea) {
          const [llx, lly, urx, ury] = s.dieArea;
          args.push(`-die_area "${llx} ${lly} ${urx} ${ury}"`);
          // OpenROAD also wants -core_area when -die_area is set explicitly;
          // assume same shape minus a small margin if not provided. We keep
          // it simple — callers using die_area should provide both via
          // raw_tcl if they need a different core.
        }
        lines.push(`initialize_floorplan ${args.join(' ')}`.trim());
        break;
      }
      case 'pdngen': {
        if (s.configFile) lines.push(`pdngen ${JSON.stringify(s.configFile)}`);
        else              lines.push(`pdngen`);
        break;
      }
      case 'tapcell': {
        const args: string[] = [];
        if (s.distance != null)   args.push(`-distance ${s.distance}`);
        if (s.tapcellMaster)      args.push(`-tapcell_master ${s.tapcellMaster}`);
        if (s.endcapMaster)       args.push(`-endcap_master ${s.endcapMaster}`);
        lines.push(`tapcell ${args.join(' ')}`.trim());
        break;
      }
      case 'macro_placement': {
        const args: string[] = [];
        if (s.halo)    args.push(`-halo {${s.halo.join(' ')}}`);
        if (s.channel) args.push(`-channel {${s.channel.join(' ')}}`);
        lines.push(`macro_placement ${args.join(' ')}`.trim());
        break;
      }
      case 'repair_design': {
        const args: string[] = [];
        if (s.maxWireLength != null) args.push(`-max_wire_length ${s.maxWireLength}`);
        if (s.slewMargin != null)    args.push(`-slew_margin ${s.slewMargin}`);
        if (s.capMargin != null)     args.push(`-cap_margin ${s.capMargin}`);
        lines.push(`repair_design ${args.join(' ')}`.trim());
        break;
      }
      case 'check_antennas': {
        if (s.reportFile) lines.push(`check_antennas -report_file ${JSON.stringify(s.reportFile)}`);
        else              lines.push(`check_antennas`);
        break;
      }
      case 'repair_antennas': {
        const args: string[] = [];
        if (s.iterations != null)  args.push(`-iterations ${s.iterations}`);
        if (s.ratioMargin != null) args.push(`-ratio_margin ${s.ratioMargin}`);
        lines.push(`repair_antennas ${args.join(' ')}`.trim());
        break;
      }
      case 'write_gds':           lines.push(`write_gds ${JSON.stringify(s.path)}`); break;
      case 'report_clock_skew':   lines.push(`report_clock_skew`); break;

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
    ['hpwl',                /HPWL\s*:\s*([\d.eE+-]+)/],
    ['wns',                 /Worst Negative Slack\s*:?\s*(-?[\d.eE+-]+)/],
    ['tns',                 /Total Negative Slack\s*:?\s*(-?[\d.eE+-]+)/],
    ['total_power',         /Total Power[^\n]*?([\d.eE+-]+)\s*(?:W|mW|µW)?/],
    ['leakage',             /Leakage[^\n]*?([\d.eE+-]+)/],
    ['overflow',            /Overflow\s*:\s*([\d.eE+-]+)/],
    ['instances',           /Number of instances\s*:\s*(\d+)/],
    ['nets',                /Number of nets\s*:\s*(\d+)/],

    // clock_tree_synthesis (TritonCTS)
    ['cts_buffers_inserted', /Number of buffers inserted\s*:?\s*(\d+)/i],
    ['cts_clock_skew',       /(?:Maximum|Max)\s+clock\s+skew\s*:?\s*([\d.eE+-]+)/i],
    ['cts_clock_latency',    /(?:Average|Avg|Max(?:imum)?)\s+clock\s+latency\s*:?\s*([\d.eE+-]+)/i],
    ['cts_sinks',            /Number of (?:sinks|Sinks)\s*:?\s*(\d+)/],

    // repair_timing
    ['repair_buffers',     /(?:Inserted|Added)\s+(\d+)\s+buffers/i],
    ['repair_resized',     /Resized\s+(\d+)\s+instances/i],
    ['repair_violations',  /Repaired\s+(\d+)\s+(?:setup|hold)?\s*violations/i],

    // report_design_area
    ['design_area',        /Design area\s+([\d.eE+-]+)\s*u\^?2?/i],
    ['utilization',        /([\d.eE+-]+)\s*%\s*utilization/i],

    // pin_placement
    ['pins_placed',        /(?:Number of pins placed|Placed)\s*:?\s*(\d+)\s*(?:pins?)?/i],

    // add_global_connection (count of successful matches)
    ['global_connections', /Global connections?\s+(?:made|added)\s*:?\s*(\d+)/i],

    // initialize_floorplan
    ['core_width',         /Core (?:area|width)\s*:?\s*([\d.eE+-]+)/i],
    ['die_width',          /Die (?:area|width)\s*:?\s*([\d.eE+-]+)/i],

    // pdngen
    ['pdn_stripes',        /(?:Power|Number of)\s+stripes?\s*:?\s*(\d+)/i],
    ['pdn_vias',           /(?:Inserted|Number of)\s+(\d+)\s+(?:power\s+)?vias/i],

    // tapcell
    ['tapcells_inserted',  /(?:Inserted|Number of)\s+(\d+)\s+(?:tapcells?|tap cells?|well\s+taps?)/i],
    ['endcaps_inserted',   /(?:Inserted|Number of)\s+(\d+)\s+endcaps?/i],

    // macro_placement
    ['macros_placed',      /(?:Placed|Number of macros placed)\s*:?\s*(\d+)\s*macros?/i],

    // repair_design (in addition to repair_buffers / repair_resized which already match)
    ['repair_design_removed', /Removed\s+(\d+)\s+buffers/i],

    // antennas
    ['antenna_violations', /(?:Found|Number of)\s+(\d+)\s+antenna\s+violations/i],
    ['antenna_repaired',   /Repaired\s+(\d+)\s+antenna\s+violations/i],

    // report_clock_skew
    ['clock_skew_max',     /(?:Max(?:imum)?|Worst)\s+clock\s+skew\s*:?\s*([\d.eE+-]+)/i],
  ];
  for (const [key, rx] of patterns) {
    const m = stdout.match(rx);
    if (m) out[key] = Number(m[1]);
  }
  return out;
}

export interface TimingPath {
  startpoint: string;
  endpoint: string;
  pathGroup?: string;
  pathType?: 'max' | 'min' | string;
  arrival: number;
  required: number;
  slack: number;
  status: 'MET' | 'VIOLATED' | 'UNKNOWN';
  /** Per-stage breakdown lines as raw text (delay/time/description). */
  stages: string[];
}

/**
 * Parse OpenSTA `report_checks` output into a structured array of paths.
 *
 * The report has a fairly stable shape: each path block opens with
 * `Startpoint:` / `Endpoint:` lines, ends with a `slack (MET|VIOLATED)` line,
 * and contains `data arrival time` / `data required time` totals.
 * We split on `Startpoint:` to keep the parser tolerant of OpenROAD banner
 * lines and other report output mixed into the same stdout.
 */
export function parseTimingPaths(stdout: string): TimingPath[] {
  const out: TimingPath[] = [];
  // Anchor on Startpoint: — split keeps the leading text in [0] which we drop.
  const blocks = stdout.split(/(?=^Startpoint:\s)/m).slice(1);
  for (const block of blocks) {
    const startMatch = block.match(/^Startpoint:\s*(\S+)/m);
    const endMatch   = block.match(/^Endpoint:\s*(\S+)/m);
    if (!startMatch || !endMatch) continue;
    const groupMatch  = block.match(/^Path Group:\s*(\S+)/m);
    const typeMatch   = block.match(/^Path Type:\s*(\S+)/m);

    // First occurrences are the cumulative path totals; later repeats in
    // the slack-delta block negate the arrival, so take the first match.
    const arrivalMatch  = block.match(/(-?[\d.]+)\s+data\s+arrival\s+time/i);
    const requiredMatch = block.match(/(-?[\d.]+)\s+data\s+required\s+time/i);
    const slackMatch    = block.match(/(-?[\d.]+)\s+slack\s*\((MET|VIOLATED)\)/i);

    if (!slackMatch) continue;

    const stages = block
      .split('\n')
      .filter(l => /^\s*-?\d+\.\d+\s+-?\d+\.\d+/.test(l))
      .map(l => l.trim());

    out.push({
      startpoint: startMatch[1],
      endpoint:   endMatch[1],
      pathGroup:  groupMatch?.[1],
      pathType:   typeMatch?.[1],
      arrival:    arrivalMatch ? Number(arrivalMatch[1]) : NaN,
      required:   requiredMatch ? Number(requiredMatch[1]) : NaN,
      slack:      Number(slackMatch[1]),
      status:     slackMatch[2].toUpperCase() === 'MET' ? 'MET' : 'VIOLATED',
      stages,
    });
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

  // Synthetic metrics so each step contributes *something* to the report
  // even when no binary is available. These are coarse estimates derived
  // from the step args + (when available) LEF/DEF; they make the composer
  // UX usable without OpenROAD installed.
  let dieW = 0, dieH = 0, instCount = 0, netCount = 0;
  if (input.lefContent && input.defContent) {
    try {
      const def = parseDef(input.defContent);
      const dbu = def.units?.dbuPerMicron ?? 1;
      const die = def.dieArea?.points;
      dieW = die ? (die[1]?.x ?? 0) / dbu : 0;
      dieH = die ? (die[1]?.y ?? 0) / dbu : 0;
      instCount = def.components.length;
      netCount = def.nets.length;
    } catch { /* ignore — leave estimates at 0 */ }
  }

  for (const s of steps) {
    switch (s.kind) {
      case 'initialize_floorplan':
        if (s.dieArea) {
          metrics.die_width = s.dieArea[2] - s.dieArea[0];
          metrics.core_width = (s.dieArea[2] - s.dieArea[0]) - 2 * (s.coreSpace ?? 0);
        } else if (dieW > 0) {
          metrics.die_width = dieW;
          metrics.core_width = dieW - 2 * (s.coreSpace ?? 0);
        }
        break;
      case 'tapcell':
        if (dieW > 0 && dieH > 0 && s.distance) {
          // Rough estimate: one tapcell per s.distance × (cell row height ≈ 1.4µm).
          metrics.tapcells_inserted = Math.max(0, Math.round((dieW / s.distance) * (dieH / 1.4)));
        }
        break;
      case 'pdngen':
        if (dieW > 0) {
          metrics.pdn_stripes = Math.max(2, Math.round(dieW / 50));
          metrics.pdn_vias = metrics.pdn_stripes * 8;
        }
        break;
      case 'pin_placement':
        // Pin-count guess: 4 sides × 4 pins per layer pair.
        metrics.pins_placed = (s.horLayers?.length ?? 0) * 4 + (s.verLayers?.length ?? 0) * 4;
        break;
      case 'add_global_connection':
        metrics.global_connections = (metrics.global_connections ?? 0) + Math.max(1, instCount);
        break;
      case 'clock_tree_synthesis':
        if (instCount > 0) {
          // CTS heuristic: ~one buffer per 16 sinks.
          const sinks = Math.max(1, Math.round(instCount * 0.1));
          metrics.cts_sinks = sinks;
          metrics.cts_buffers_inserted = Math.max(1, Math.round(sinks / 16));
          metrics.cts_clock_skew = 0.085;
          metrics.cts_clock_latency = 0.412;
        }
        break;
      case 'repair_timing':
        if (instCount > 0) {
          metrics.repair_buffers   = Math.max(0, Math.round(instCount * 0.01));
          metrics.repair_resized   = Math.max(0, Math.round(instCount * 0.025));
          metrics.repair_violations = Math.max(0, Math.round(instCount * 0.005));
        }
        break;
      case 'repair_design':
        if (instCount > 0) {
          metrics.repair_buffers = (metrics.repair_buffers ?? 0) + Math.max(1, Math.round(instCount * 0.005));
        }
        break;
      case 'macro_placement':
        // Estimate macros from DEF: any component whose macro starts with capital + digit run.
        metrics.macros_placed = Math.max(0, Math.round(instCount * 0.02));
        break;
      case 'global_route':
      case 'detailed_route':
        if (dieW > 0 && dieH > 0) {
          metrics.hpwl = (metrics.hpwl ?? 0) || dieW * dieH * 0.3;
          metrics.overflow = 0.0;
        }
        break;
      case 'check_antennas':
        metrics.antenna_violations = Math.max(0, Math.round(instCount * 0.001));
        break;
      case 'repair_antennas':
        metrics.antenna_repaired = metrics.antenna_violations ?? 0;
        break;
      case 'report_design_area':
        if (dieW > 0 && dieH > 0) {
          metrics.design_area = dieW * dieH;
          metrics.utilization = 60;
        }
        break;
      case 'report_power':
        if (instCount > 0) {
          // Rough: 0.05 µW per instance.
          metrics.total_power = instCount * 5e-8;
          metrics.leakage = metrics.total_power * 0.1;
        }
        break;
      case 'report_wirelength':
        if (dieW > 0 && dieH > 0 && metrics.hpwl == null) {
          metrics.hpwl = dieW * dieH * 0.3;
        }
        break;
      case 'report_clock_skew':
        if (metrics.cts_clock_skew != null) metrics.clock_skew_max = metrics.cts_clock_skew;
        break;
      default:
        break;
    }
  }
  if (instCount > 0 && metrics.instances == null) metrics.instances = instCount;
  if (netCount > 0 && metrics.nets == null) metrics.nets = netCount;

  return {
    ranReal: false,
    metrics,
    placedCells,
    stdoutTail: `# fallback run — openroad binary not available\n# metrics: ${JSON.stringify(metrics)}\n`,
    stderrTail: '',
    exitCode: null,
  };
}
