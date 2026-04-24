/**
 * OpenLane-simulation orchestrator.
 *
 * Runs the same algorithm suite the `/api/flow` handler does, but reshapes
 * every stage's output into the artefacts a real OpenLane run produces:
 *
 *   - A per-stage text log ("[INFO] yosys: reading rtl/top.v")
 *   - One or more `.rpt` report files per stage, keyed by the path they'd
 *     land at in `runs/<tag>/reports/...`.
 *   - A single aggregated `metrics.json` with the exact key style OpenLane
 *     emits (`synthesis__num_cells`, `placement__wns__corner:tt_025C_1v80`).
 *
 * No real Yosys or OpenROAD is involved — this is educational fidelity,
 * not foundry-grade output.
 */

import { runSynthesis } from '@/lib/algorithms/synthesis';
import { runFloorplanning } from '@/lib/algorithms/floorplanning';
import { quadraticPlacement } from '@/lib/algorithms/placement_analytical';
import { tetrisLegalization } from '@/lib/algorithms/legalization';
import { runClockTree } from '@/lib/algorithms/clocktree';
import { runRouting } from '@/lib/algorithms/routing';
import { runMMMC, defaultCorners } from '@/lib/algorithms/mmmc_sta';
import { runDft } from '@/lib/algorithms/dft';
import { runThermal } from '@/lib/algorithms/thermal';
import type { Cell, Net } from '@/types/algorithms';
import type {
  OpenlaneDesign,
  OpenlaneStageReport,
  OpenlaneLayout,
} from '@/lib/db';

// --- OpenLane's default config knobs we honour ------------------------------

export interface OpenlaneConfig {
  DESIGN_NAME?: string;
  CLOCK_PERIOD?: number;        // ns
  FP_CORE_UTIL?: number;        // 0..1
  PL_TARGET_DENSITY?: number;   // 0..1
  SYNTH_STRATEGY?: string;      // "AREA 0" / "DELAY 1"
  RT_MAX_LAYER?: string;        // "met5"
  DIE_AREA_X?: number;
  DIE_AREA_Y?: number;
  CELL_COUNT?: number;          // synthetic if no RTL-derived netlist
  NET_COUNT?: number;
  /** PDK root — picks the standard-cell library referenced in reports.
   *  Supported: "sky130A" (default), "sky130B", "gf180mcuC", "gf180mcuD". */
  PDK?: string;
  /** Interactive "run-to" stage. If set, the flow halts after the named
   *  stage completes (matches OpenLane's `flow.tcl -to <stage>`). */
  RUN_TO?: string;
}

/** Valid PDK names the UI offers. Order reflects real-world popularity. */
export const PDK_OPTIONS: Array<{ id: string; stdCellLib: string; node: string }> = [
  { id: 'sky130A',   stdCellLib: 'sky130_fd_sc_hd',   node: '130nm' },
  { id: 'sky130B',   stdCellLib: 'sky130_fd_sc_hs',   node: '130nm' },
  { id: 'gf180mcuC', stdCellLib: 'gf180mcu_fd_sc_mcu7t5v0', node: '180nm' },
  { id: 'gf180mcuD', stdCellLib: 'gf180mcu_fd_sc_mcu9t5v0', node: '180nm' },
];

/** Canonical stage ordering — used by RUN_TO to decide when to stop. */
export const STAGE_ORDER = [
  'synthesis', 'sta_pre', 'floorplan', 'placement', 'cts', 'routing',
  'antenna', 'sta_post', 'drc', 'lvs', 'signoff',
] as const;

const DEFAULT_CONFIG: Required<OpenlaneConfig> = {
  DESIGN_NAME: 'top',
  CLOCK_PERIOD: 10,
  FP_CORE_UTIL: 0.5,
  PL_TARGET_DENSITY: 0.55,
  SYNTH_STRATEGY: 'AREA 0',
  RT_MAX_LAYER: 'met5',
  DIE_AREA_X: 1000,
  DIE_AREA_Y: 1000,
  CELL_COUNT: 30,
  NET_COUNT: 40,
  PDK: 'sky130A',
  RUN_TO: 'signoff',
};

// --- helpers ----------------------------------------------------------------

const ts = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const info  = (s: string) => `[${ts()}] [INFO]  ${s}`;
const warn  = (s: string) => `[${ts()}] [WARN]  ${s}`;
const error = (s: string) => `[${ts()}] [ERROR] ${s}`;
const stepHeader = (i: number, total: number, name: string) =>
  `\n--- [STEP ${i}/${total}] ${name.toUpperCase()} ---`;

function makeCells(n: number): Cell[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `c${i}`,
    name: i % 7 === 0 ? `DFF_${i}` : `cell_${i}`,
    width: 20 + (i % 5) * 4,
    height: 20 + (i % 3) * 4,
    pins: [
      { id: `c${i}_in`,  name: 'A', position: { x: 0,  y: 10 }, direction: 'input'  },
      { id: `c${i}_out`, name: 'Y', position: { x: 20, y: 10 }, direction: 'output' },
    ],
    type: 'standard',
  }));
}

function makeNets(cellCount: number, netCount: number): Net[] {
  return Array.from({ length: netCount }, (_, i) => ({
    id: `n${i}`,
    name: `n${i}`,
    pins: [`c${i % cellCount}_out`, `c${(i + 1) % cellCount}_in`],
    weight: 1,
  }));
}

function makeRpt(lines: string[]): string {
  return lines.join('\n') + '\n';
}

// --- main entry -------------------------------------------------------------

export interface OrchestratorResult {
  stages: OpenlaneStageReport[];
  metrics: Record<string, number | string>;
  layout: OpenlaneLayout;
  totalRuntimeMs: number;
  status: 'success' | 'failed';
}

/**
 * Execute the full 10-stage OpenLane-style flow for a single design.
 *
 * Each stage is a direct call into the library algorithm (same imports
 * the `/api/flow` route uses) — we only reshape the output.
 */
export function runOpenlaneFlow(
  design: OpenlaneDesign,
  userConfig: OpenlaneConfig,
): OrchestratorResult {
  const cfg = { ...DEFAULT_CONFIG, ...design.config, ...userConfig };
  const CELL_COUNT = cfg.CELL_COUNT;
  const NET_COUNT = cfg.NET_COUNT;
  const W = cfg.DIE_AREA_X;
  const H = cfg.DIE_AREA_Y;
  // Stages: synthesis, sta_pre, floorplan, placement, cts, routing, antenna,
  // sta_post, drc, lvs, signoff.
  const TOTAL = 11;

  const stages: OpenlaneStageReport[] = [];
  let cells = makeCells(CELL_COUNT);
  const nets = makeNets(CELL_COUNT, NET_COUNT);

  // Values produced by earlier stages that later stages need. These must be
  // hoisted out of each stage's block scope so they can cross the boundary.
  let synthCriticalNs = 0;
  let synthGateCount = 0;

  // Interactive "run-to": OpenLane's `flow.tcl -to <stage>` equivalent.
  // Normalize the config value to a known stage name; if unknown, run to
  // the end. Index-based check so we halt after (not before) the target.
  const runToIdx = STAGE_ORDER.indexOf(cfg.RUN_TO as typeof STAGE_ORDER[number]);
  const targetIdx = runToIdx < 0 ? STAGE_ORDER.length - 1 : runToIdx;

  // Sentinel thrown by `pushStage` to unwind out of the remaining stage
  // blocks cleanly. Caught at the bottom — the finalize block after it still
  // runs, so metrics/layout/totalRuntime aggregate correctly for partial flows.
  class StopFlow extends Error {
    constructor() { super('StopFlow'); }
  }

  const pushStage = (s: OpenlaneStageReport) => {
    stages.push(s);
    const curIdx = STAGE_ORDER.indexOf(s.stage as typeof STAGE_ORDER[number]);
    if (curIdx >= targetIdx) throw new StopFlow();
  };

  // Resolve the PDK — looked up at stage time to reference the correct
  // std-cell library name in reports.
  const pdk = PDK_OPTIONS.find(p => p.id === cfg.PDK) ?? PDK_OPTIONS[0];

  // Hoisted so the finalize block can read routed wires even when RUN_TO
  // stops the flow before the aggregation point (e.g. halt at `placement`).
  let routedWires: OpenlaneLayout['wires'] = [];

  try {

  // 1. Synthesis ----------------------------------------------------------
  {
    const t0 = performance.now();
    const log: string[] = [
      stepHeader(1, TOTAL, 'synthesis'),
      info(`yosys-equivalent: reading RTL for ${cfg.DESIGN_NAME}`),
      info(`SYNTH_STRATEGY = ${cfg.SYNTH_STRATEGY}`),
    ];
    const r: any = runSynthesis({
      algorithm: 'logic_optimization',
      netlist: design.rtl || `module ${cfg.DESIGN_NAME}(); wire a,b,c; and(c,a,b); endmodule`,
      targetLibrary: pdk.stdCellLib,
      optimizationLevel: cfg.SYNTH_STRATEGY.startsWith('AREA') ? 'area' : 'delay',
      clockPeriod: cfg.CLOCK_PERIOD,
    } as any);
    const runtimeMs = performance.now() - t0;
    synthCriticalNs = Number(r.criticalPathDelay ?? 0);
    synthGateCount = Number(r.gateCount ?? 0);
    log.push(info(`mapped ${synthGateCount} cells, area=${r.area ?? 0}`));
    log.push(info(`synthesis finished in ${runtimeMs.toFixed(1)}ms`));
    pushStage({
      stage: 'synthesis',
      status: r.success ? 'success' : 'fail',
      runtimeMs,
      logLines: log,
      reportRpts: {
        'reports/synthesis/1-synthesis.rpt': makeRpt([
          `Synthesis report for ${cfg.DESIGN_NAME}`,
          `Strategy        : ${cfg.SYNTH_STRATEGY}`,
          `Target library  : sky130_fd_sc_hd`,
          `Gate count      : ${synthGateCount}`,
          `Area (um^2)     : ${r.area ?? 0}`,
          `Est. power (mW) : ${r.power ?? 0}`,
          `Critical path   : ${synthCriticalNs.toFixed(3)} ns`,
        ]),
        // Effective config — mirrors OpenLane's `config.json` dump. Attaching
        // to the synthesis stage since it runs first.
        'reports/config.json': JSON.stringify(cfg, null, 2) + '\n',
      },
      metrics: {
        synthesis__num_cells: r.gateCount ?? 0,
        synthesis__area: r.area ?? 0,
        synthesis__power: r.power ?? 0,
        synthesis__critical_path_ns: r.criticalPathDelay ?? 0,
      },
    });
  }

  // 2. Pre-layout STA -----------------------------------------------------
  {
    const t0 = performance.now();
    const log = [
      stepHeader(2, TOTAL, 'sta (pre-layout)'),
      info(`OpenSTA-equivalent: reading SDC, clock period = ${cfg.CLOCK_PERIOD}ns`),
    ];
    // Use the critical path the synthesis stage actually reported.  Fall
    // back to a cheap 0.6× estimate only if synthesis produced nothing
    // usable (e.g. it errored out and still pushed a stage).
    const estCritical = synthCriticalNs > 0 ? synthCriticalNs : cfg.CLOCK_PERIOD * 0.6;
    log.push(info(`using synthesis critical path = ${estCritical.toFixed(3)} ns`));
    const wnsPre = cfg.CLOCK_PERIOD - estCritical;
    const runtimeMs = performance.now() - t0;
    log.push(info(`estimated WNS = ${wnsPre.toFixed(3)} ns`));
    pushStage({
      stage: 'sta_pre',
      status: wnsPre >= 0 ? 'success' : 'warn',
      runtimeMs,
      logLines: log,
      reportRpts: {
        'reports/sta/pre_layout.rpt': makeRpt([
          `Pre-layout STA`,
          `Clock period     : ${cfg.CLOCK_PERIOD} ns`,
          `Est. critical    : ${estCritical.toFixed(3)} ns`,
          `WNS              : ${wnsPre.toFixed(3)} ns`,
        ]),
      },
      metrics: {
        'sta_pre__wns__corner:tt_025C_1v80': wnsPre,
        'sta_pre__clock_period_ns': cfg.CLOCK_PERIOD,
      },
    });
  }

  // 3. Floorplan ----------------------------------------------------------
  {
    const t0 = performance.now();
    const log = [
      stepHeader(3, TOTAL, 'floorplan'),
      info(`init_floorplan: DIE_AREA = 0 0 ${W} ${H}, FP_CORE_UTIL = ${cfg.FP_CORE_UTIL}`),
    ];
    const r: any = runFloorplanning({
      algorithm: 'slicing_tree',
      chipWidth: W, chipHeight: H,
      blocks: cells,
      aspectRatioMin: 0.5, aspectRatioMax: 2.0,
      utilizationTarget: cfg.FP_CORE_UTIL,
    } as any);
    if (r.blocks) cells = r.blocks;
    const runtimeMs = performance.now() - t0;
    log.push(info(`floorplan area=${r.area ?? 0}, util=${(r.utilization ?? cfg.FP_CORE_UTIL).toFixed(3)}`));
    pushStage({
      stage: 'floorplan',
      status: r.success ? 'success' : 'fail',
      runtimeMs,
      logLines: log,
      reportRpts: {
        'reports/floorplan/3-initial_fp.rpt': makeRpt([
          `Floorplan report`,
          `Die area (um^2) : ${W * H}`,
          `Target util     : ${cfg.FP_CORE_UTIL}`,
          `Achieved area   : ${r.area ?? 0}`,
          `Aspect ratio    : ${(r.aspectRatio ?? 1).toFixed(3)}`,
          `Dead space      : ${(r.deadSpace ?? 0).toFixed(3)}`,
        ]),
      },
      metrics: {
        floorplan__die_area: W * H,
        floorplan__utilization: r.utilization ?? cfg.FP_CORE_UTIL,
        floorplan__aspect_ratio: r.aspectRatio ?? 1,
      },
    });
  }

  // 4. Placement ----------------------------------------------------------
  {
    const t0 = performance.now();
    const log = [
      stepHeader(4, TOTAL, 'placement'),
      info(`global_placement: PL_TARGET_DENSITY = ${cfg.PL_TARGET_DENSITY}`),
    ];
    const rg: any = quadraticPlacement({
      algorithm: 'analytical' as any,
      chipWidth: W, chipHeight: H, cells, nets, iterations: 0,
    } as any);
    cells = rg.cells;
    log.push(info(`global placer: WL = ${rg.totalWirelength?.toFixed?.(1) ?? rg.totalWirelength}`));
    log.push(info(`detailed_placement: running tetris legalization`));
    const rd: any = tetrisLegalization({
      algorithm: 'tetris' as any,
      chipWidth: W, chipHeight: H, cells, nets, iterations: 0,
    } as any);
    cells = rd.cells;
    const runtimeMs = performance.now() - t0;
    log.push(info(`detailed placer: WL = ${rd.totalWirelength?.toFixed?.(1) ?? rd.totalWirelength}, overlap = ${rd.overlap ?? 0}`));
    pushStage({
      stage: 'placement',
      status: rd.success ? 'success' : 'fail',
      runtimeMs,
      logLines: log,
      reportRpts: {
        'reports/placement/4-global_placement.rpt': makeRpt([
          `Global placement`,
          `Wirelength (global): ${rg.totalWirelength ?? 0}`,
          `Target density     : ${cfg.PL_TARGET_DENSITY}`,
        ]),
        'reports/placement/5-detailed_placement.rpt': makeRpt([
          `Detailed placement (tetris legalization)`,
          `Wirelength         : ${rd.totalWirelength ?? 0}`,
          `Overlap            : ${rd.overlap ?? 0}`,
        ]),
      },
      metrics: {
        placement__wirelength_global: rg.totalWirelength ?? 0,
        placement__wirelength_detailed: rd.totalWirelength ?? 0,
        placement__overlap: rd.overlap ?? 0,
      },
    });
  }

  // 5. CTS ----------------------------------------------------------------
  {
    const t0 = performance.now();
    const log = [
      stepHeader(5, TOTAL, 'cts'),
      info(`TritonCTS-equivalent: extracting FF sinks`),
    ];
    const sinks = cells
      .filter(c => c.name.includes('DFF'))
      .map(c => ({
        x: (c.position?.x ?? 0) + c.width / 2,
        y: (c.position?.y ?? 0) + c.height / 2,
      }));
    const r: any = runClockTree({
      algorithm: 'h_tree',
      clockSource: { x: W / 2, y: H / 2 },
      sinks: sinks.length > 0 ? sinks : [{ x: W / 4, y: H / 4 }],
      chipWidth: W, chipHeight: H,
      meshDensity: 4, maxSkew: 0.1,
    } as any);
    const runtimeMs = performance.now() - t0;
    log.push(info(`built clock tree with ${sinks.length} sinks, skew = ${(r.maxSkew ?? 0).toFixed(3)} ns`));
    pushStage({
      stage: 'cts',
      status: r.success ? 'success' : 'warn',
      runtimeMs,
      logLines: log,
      reportRpts: {
        'reports/cts/6-cts.rpt': makeRpt([
          `Clock Tree Synthesis`,
          `Sinks         : ${sinks.length}`,
          `Max skew (ns) : ${(r.maxSkew ?? 0).toFixed(3)}`,
          `CTS WL        : ${r.wirelength ?? 0}`,
          `Buffer count  : ${r.bufferCount ?? 0}`,
        ]),
      },
      metrics: {
        cts__num_sinks: sinks.length,
        cts__max_skew_ns: r.maxSkew ?? 0,
        cts__wirelength: r.wirelength ?? 0,
      },
    });
  }

  // 6. Routing ------------------------------------------------------------
  {
    const t0 = performance.now();
    const log = [
      stepHeader(6, TOTAL, 'routing'),
      info(`FastRoute-equivalent: global routing (RT_MAX_LAYER = ${cfg.RT_MAX_LAYER})`),
    ];
    const r: any = runRouting({
      algorithm: 'flute' as any,
      chipWidth: W, chipHeight: H, cells, nets,
      layers: 3, gridSize: 20, viaWeight: 2, bendWeight: 1.5,
    } as any);
    if (Array.isArray(r.wires)) {
      routedWires = r.wires.map((w: any) => ({
        id: String(w.id),
        netId: String(w.netId ?? w.net ?? ''),
        layer: Number(w.layer ?? 1),
        points: Array.isArray(w.points)
          ? w.points.map((p: any) => ({ x: Number(p.x ?? 0), y: Number(p.y ?? 0) }))
          : [],
      }));
    }
    const runtimeMs = performance.now() - t0;
    const unroutedCount = Array.isArray(r.unroutedNets) ? r.unroutedNets.length : 0;
    log.push(info(`TritonRoute-equivalent: detailed routing complete`));
    log.push(unroutedCount === 0
      ? info(`0 unrouted nets — routing clean`)
      : warn(`${unroutedCount} unrouted nets`));
    pushStage({
      stage: 'routing',
      status: unroutedCount === 0 ? 'success' : 'warn',
      runtimeMs,
      logLines: log,
      reportRpts: {
        'reports/routing/7-routing.rpt': makeRpt([
          `Routing`,
          `Total wirelength : ${r.totalWirelength ?? 0}`,
          `Via count        : ${r.viaCount ?? 0}`,
          `Unrouted nets    : ${unroutedCount}`,
          `Max layer        : ${cfg.RT_MAX_LAYER}`,
        ]),
      },
      metrics: {
        routing__wirelength: r.totalWirelength ?? 0,
        routing__via_count: r.viaCount ?? 0,
        routing__unrouted_nets: unroutedCount,
      },
    });
  }

  // 7. Antenna check ------------------------------------------------------
  // Educational antenna rule: any wire that runs on a single metal layer
  // for more than ANTENNA_MAX_LEN without a layer change is flagged. Real
  // antenna checks use the ratio of metal area to gate area, but for a
  // simulation this single-layer length rule captures the intent.
  const ANTENNA_MAX_LEN = 500;
  {
    const t0 = performance.now();
    const log = [
      stepHeader(7, TOTAL, 'antenna'),
      info(`antenna check: max single-layer length = ${ANTENNA_MAX_LEN} units`),
    ];
    const wireLen = (pts: Array<{ x: number; y: number }>) => {
      let sum = 0;
      for (let i = 1; i < pts.length; i++) {
        const dx = pts[i].x - pts[i - 1].x;
        const dy = pts[i].y - pts[i - 1].y;
        sum += Math.abs(dx) + Math.abs(dy); // Manhattan length
      }
      return sum;
    };
    const violations = routedWires
      .map(w => ({ wire: w, length: wireLen(w.points) }))
      .filter(x => x.length > ANTENNA_MAX_LEN);
    const runtimeMs = performance.now() - t0;
    log.push(violations.length === 0
      ? info(`0 antenna violations across ${routedWires.length} wires`)
      : warn(`${violations.length} antenna violations (single-layer runs > ${ANTENNA_MAX_LEN})`));
    pushStage({
      stage: 'antenna',
      status: violations.length === 0 ? 'success' : 'warn',
      runtimeMs,
      logLines: log,
      reportRpts: {
        'reports/signoff/antenna.rpt': makeRpt([
          `Antenna check`,
          `Wires inspected  : ${routedWires.length}`,
          `Max length (lim) : ${ANTENNA_MAX_LEN}`,
          `Violations       : ${violations.length}`,
          ...violations.slice(0, 20).map(
            (v, i) => `  #${i + 1} wire=${v.wire.id} net=${v.wire.netId} layer=M${v.wire.layer} len=${v.length.toFixed(1)}`,
          ),
        ]),
      },
      metrics: {
        antenna__num_violations: violations.length,
        antenna__wires_inspected: routedWires.length,
        antenna__max_length_threshold: ANTENNA_MAX_LEN,
      },
    });
  }

  // 8. Post-layout STA ----------------------------------------------------
  {
    const t0 = performance.now();
    const log = [
      stepHeader(8, TOTAL, 'sta (post-layout)'),
      info(`OpenSTA-equivalent: running MMMC across corners`),
    ];
    const corners = defaultCorners();
    // Derive path delays from the synthesis critical path so post-STA
    // tracks what the design actually looks like. Converting ns→ps.
    const baseDelayPs = Math.max(100, synthCriticalNs * 1000);
    const paths = [
      { id: 'p1', required: cfg.CLOCK_PERIOD * 1000, launchDelay: 100, captureDelay: 100,
        arcs: [{ id: 'a1', delay: baseDelayPs * 0.8, type: 'cell' as const, fromPin: 'q', toPin: 'd' }] },
      { id: 'p2', required: cfg.CLOCK_PERIOD * 1000, launchDelay: 100, captureDelay: 100,
        arcs: [{ id: 'a2', delay: baseDelayPs * 1.1, type: 'cell' as const, fromPin: 'q', toPin: 'd' }] },
    ];
    const r = runMMMC(corners, paths as any, {});
    const runtimeMs = performance.now() - t0;
    // `runMMMC` returns per-corner wns/tns plus a worst-of-corners tuple.
    // We surface BOTH: one metric per (wns|tns, cornerId) and a roll-up for
    // the signoff gate.
    const wns = r.worstWNS?.slack ?? 0;
    const tns = r.totalTNS ?? 0;
    log.push(info(`${corners.length} corners analysed`));
    for (const pc of r.perCorner) {
      log.push(info(`  [${pc.cornerId}] WNS=${pc.wns.toFixed(3)}ns  TNS=${pc.tns.toFixed(3)}ns`));
    }
    log.push(wns >= 0 ? info(`worst WNS = ${wns.toFixed(3)} (${r.worstWNS?.cornerId}), timing MET`)
                      : error(`worst WNS = ${wns.toFixed(3)} (${r.worstWNS?.cornerId}), timing VIOLATED`));

    // Per-corner metric keys: sta_post__wns__corner:<cornerId>, same for tns.
    // Emit a metric for EVERY corner so the signoff summary can build a table.
    const perCornerMetrics: Record<string, number | string> = {};
    for (const pc of r.perCorner) {
      perCornerMetrics[`sta_post__wns__corner:${pc.cornerId}`] = pc.wns;
      perCornerMetrics[`sta_post__tns__corner:${pc.cornerId}`] = pc.tns;
    }

    // Keep the legacy tt_025C_1v80 key for back-compat with older signoff
    // cards that hard-coded it; drop it into the map only if MMMC didn't
    // already produce a matching key.
    const legacyWnsKey = 'sta_post__wns__corner:tt_025C_1v80';
    if (!(legacyWnsKey in perCornerMetrics)) perCornerMetrics[legacyWnsKey] = wns;
    const legacyTnsKey = 'sta_post__tns__corner:tt_025C_1v80';
    if (!(legacyTnsKey in perCornerMetrics)) perCornerMetrics[legacyTnsKey] = tns;

    // Top-N critical paths, globally worst across all corners. Pull each
    // corner's `worstPaths` list and flatten → sort → slice. This matches the
    // `reports/sta/top_N_worst_paths.rpt` OpenSTA emits in signoff.
    const TOP_N = 5;
    const allWorst = r.perCorner.flatMap(pc => pc.worstPaths);
    const critical = [...allWorst].sort((a, b) => a.slack - b.slack).slice(0, TOP_N);
    const criticalLines = critical.length === 0
      ? ['(no timing paths analysed)']
      : critical.map((p, i) =>
          `  #${i + 1}  corner=${p.cornerId.padEnd(18)} path=${p.pathId.padEnd(8)} arrival=${p.arrival.toFixed(1).padStart(8)}ps  slack=${p.slack.toFixed(3).padStart(8)}ns`,
        );

    pushStage({
      stage: 'sta_post',
      status: wns >= 0 ? 'success' : 'fail',
      runtimeMs,
      logLines: log,
      reportRpts: {
        'reports/sta/post_layout.rpt': makeRpt([
          `Post-layout STA (MMMC)`,
          `Corners analysed : ${corners.length}`,
          '',
          'Per-corner slack',
          '----------------',
          ...r.perCorner.map(pc =>
            `  ${pc.cornerId.padEnd(18)} WNS=${pc.wns.toFixed(3).padStart(8)} ns   TNS=${pc.tns.toFixed(3).padStart(8)} ns`,
          ),
          '',
          `Worst corner    : ${r.worstWNS?.cornerId ?? '-'}`,
          `Worst WNS (ns)  : ${wns.toFixed(3)}`,
          `Total TNS (ns)  : ${tns.toFixed(3)}`,
        ]),
        'reports/sta/top_N_worst_paths.rpt': makeRpt([
          `Top ${TOP_N} critical paths (worst across all corners)`,
          ''.padEnd(72, '-'),
          ...criticalLines,
        ]),
      },
      metrics: {
        ...perCornerMetrics,
        sta_post__num_corners: corners.length,
        sta_post__worst_corner: r.worstWNS?.cornerId ?? '',
        'sta_post__corners_list': r.perCorner.map(pc => pc.cornerId).join(','),
      },
    });
  }

  // 9. DRC ----------------------------------------------------------------
  {
    const t0 = performance.now();
    const log = [
      stepHeader(9, TOTAL, 'drc'),
      info(`Magic-equivalent: running sky130A.drc rule deck`),
    ];
    // M1 geometries — one rect per placed cell.
    const m1Geoms = cells.map(c => ({
      id: c.id,
      layer: 'M1',
      rect: {
        xl: c.position?.x ?? 0,
        yl: c.position?.y ?? 0,
        xh: (c.position?.x ?? 0) + c.width,
        yh: (c.position?.y ?? 0) + c.height,
      },
    }));
    // Synthetic VIA1 geometries: a 2×2 via at the centre of every placed
    // cell, representing an M1→M2 power/signal via. This gives the
    // enclosure rule something to bite on.
    const VIA_SIZE = 2;
    const viaGeoms = cells.map(c => {
      const cx = (c.position?.x ?? 0) + c.width / 2;
      const cy = (c.position?.y ?? 0) + c.height / 2;
      return {
        id: `${c.id}_via`,
        layer: 'VIA1',
        rect: {
          xl: cx - VIA_SIZE / 2,
          yl: cy - VIA_SIZE / 2,
          xh: cx + VIA_SIZE / 2,
          yh: cy + VIA_SIZE / 2,
        },
      };
    });
    const geoms = [...m1Geoms, ...viaGeoms];
    const { runDrc } = require('@/lib/algorithms/drc_ruledeck');
    const r = runDrc({
      name: 'sky130A_min', technology: 'sky130A',
      rules: [
        { kind: 'min_width',   layer: 'M1', min: 5 },
        { kind: 'min_area',    layer: 'M1', min: 100 },
        // Cells must not touch / overlap — minimum 2 units between M1 rects.
        { kind: 'min_spacing', layer: 'M1', min: 2 },
        // Every VIA1 must be enclosed by M1 with ≥1 unit of margin.
        { kind: 'enclosure',   inner: 'VIA1', outer: 'M1', min: 1 },
      ],
    }, geoms);
    const runtimeMs = performance.now() - t0;
    log.push(r.violations.length === 0
      ? info(`0 DRC violations — sign-off clean`)
      : error(`${r.violations.length} DRC violations`));
    pushStage({
      stage: 'drc',
      status: r.violations.length === 0 ? 'success' : 'fail',
      runtimeMs,
      logLines: log,
      reportRpts: {
        'reports/signoff/drc.rpt': makeRpt([
          `DRC (Magic-style)`,
          `Rule deck    : sky130A_min`,
          `Geometries   : ${r.geometryCount}`,
          `Violations   : ${r.violations.length}`,
          ...r.violations.slice(0, 20).map(
            (v: any, i: number) => `  #${i + 1} ${v.kind ?? 'rule'} @ ${JSON.stringify(v.location ?? v)}`,
          ),
        ]),
      },
      metrics: {
        drc__num_violations: r.violations.length,
        drc__geometry_count: r.geometryCount,
      },
    });
  }

  // 10. LVS ---------------------------------------------------------------
  {
    const t0 = performance.now();
    const log = [
      stepHeader(10, TOTAL, 'lvs'),
      info(`Netgen-equivalent: comparing layout netlist to source`),
    ];
    // 1. Count match: the synthesised gate count should agree with the
    //    number of layout cells we actually placed. Allow the greater of
    //    2 cells or 10% slack, mirroring real LVS tolerance for buffer /
    //    scan-chain insertion.
    const layoutCells = cells.length;
    const cellTolerance = Math.max(2, Math.ceil(synthGateCount * 0.10));
    const cellDelta = Math.abs(layoutCells - synthGateCount);
    const cellCountOk = synthGateCount > 0 && cellDelta <= cellTolerance;
    log.push(info(`cell count: layout=${layoutCells}, synth=${synthGateCount}, Δ=${cellDelta} (tol ${cellTolerance})`));

    // 2. Connectivity: every net pin should resolve to a pin on a real
    //    cell. If a net references a missing pin, LVS would fail.
    const knownPinIds = new Set<string>();
    for (const c of cells) for (const p of c.pins) knownPinIds.add(p.id);
    const danglingNets = nets.filter(n => n.pins.some(pid => !knownPinIds.has(pid)));
    const connectivityOk = danglingNets.length === 0;
    log.push(connectivityOk
      ? info(`connectivity: all ${nets.length} nets resolved`)
      : error(`connectivity: ${danglingNets.length} net(s) reference unknown pins`));

    // 3. Routing must have completed — an unrouted net is LVS-opaque.
    const routingOk = stages.find(s => s.stage === 'routing')?.status === 'success';

    const clean = cellCountOk && connectivityOk && routingOk;
    const runtimeMs = performance.now() - t0;
    log.push(clean
      ? info(`Circuits match — LVS clean`)
      : error(`LVS FAIL: count_ok=${cellCountOk} conn_ok=${connectivityOk} routing_ok=${routingOk}`));
    pushStage({
      stage: 'lvs',
      status: clean ? 'success' : 'fail',
      runtimeMs,
      logLines: log,
      reportRpts: {
        'reports/signoff/lvs.rpt': makeRpt([
          `LVS (Netgen-style)`,
          `Synth gates         : ${synthGateCount}`,
          `Layout cells        : ${layoutCells}`,
          `Cell Δ / tolerance  : ${cellDelta} / ${cellTolerance}`,
          `Cell count match    : ${cellCountOk ? 'PASS' : 'FAIL'}`,
          `Layout nets         : ${nets.length}`,
          `Dangling nets       : ${danglingNets.length}`,
          `Connectivity        : ${connectivityOk ? 'PASS' : 'FAIL'}`,
          `Routing pre-req     : ${routingOk ? 'PASS' : 'FAIL'}`,
          `Result              : ${clean ? 'clean' : 'FAIL'}`,
        ]),
      },
      metrics: {
        lvs__clean: clean ? 1 : 0,
        lvs__layout_cells: layoutCells,
        lvs__synth_gates: synthGateCount,
        lvs__cell_delta: cellDelta,
        lvs__dangling_nets: danglingNets.length,
      },
    });
  }

  // 11. Signoff (thermal + DFT rollup) -----------------------------------
  {
    const t0 = performance.now();
    const log = [
      stepHeader(11, TOTAL, 'signoff'),
      info(`running DFT scan-chain insertion`),
    ];
    const dft: any = runDft({ algorithm: 'scan_chain_insertion', cells } as any);
    log.push(info(`inserted ${dft.chains?.length ?? 0} scan chains`));
    log.push(info(`running thermal RC solve`));
    const th: any = runThermal({
      algorithm: 'thermal_rc',
      cells, chipWidth: W, chipHeight: H,
      tilePitch: 100, defaultPowerDensity: 0.005,
    } as any);
    log.push(info(`thermal peak rise = ${(th.peak ?? 0).toFixed(2)} K`));
    const runtimeMs = performance.now() - t0;

    const drcOk = stages.find(s => s.stage === 'drc')?.status === 'success';
    const lvsOk = stages.find(s => s.stage === 'lvs')?.status === 'success';
    const staOk = stages.find(s => s.stage === 'sta_post')?.status === 'success';
    const antennaOk = stages.find(s => s.stage === 'antenna')?.status === 'success';
    const final = drcOk && lvsOk && staOk ? 'success' : 'warn';
    log.push(final === 'success'
      ? info(`SIGNOFF PASSED — design is ready for tapeout (educational stub)`)
      : warn(`SIGNOFF MARGINAL — drc=${drcOk} lvs=${lvsOk} sta=${staOk} antenna=${antennaOk}`));
    pushStage({
      stage: 'signoff',
      status: final,
      runtimeMs,
      logLines: log,
      reportRpts: {
        'reports/signoff/summary.rpt': makeRpt([
          `Signoff summary`,
          `DRC          : ${drcOk ? 'PASS' : 'FAIL'}`,
          `LVS          : ${lvsOk ? 'PASS' : 'FAIL'}`,
          `STA (post)   : ${staOk ? 'PASS' : 'FAIL'}`,
          `Antenna      : ${antennaOk ? 'PASS' : 'WARN'}`,
          `Scan chains  : ${dft.chains?.length ?? 0}`,
          `Thermal peak : ${(th.peak ?? 0).toFixed(2)} K`,
        ]),
      },
      metrics: {
        signoff__drc_pass: drcOk ? 1 : 0,
        signoff__lvs_pass: lvsOk ? 1 : 0,
        signoff__sta_pass: staOk ? 1 : 0,
        signoff__antenna_pass: antennaOk ? 1 : 0,
        signoff__scan_chains: dft.chains?.length ?? 0,
        signoff__thermal_peak_k: th.peak ?? 0,
      },
    });
  }

  } catch (e) {
    if (!(e instanceof StopFlow)) throw e;
    // RUN_TO reached — fall through to the finalize block below.
  }

  // --- aggregate metrics.json -------------------------------------------
  const metrics: Record<string, number | string> = {};
  for (const s of stages) for (const [k, v] of Object.entries(s.metrics)) metrics[k] = v;

  const totalRuntimeMs = stages.reduce((acc, s) => acc + s.runtimeMs, 0);
  metrics['flow__total_runtime_ms'] = Math.round(totalRuntimeMs);
  metrics['flow__stages_run'] = stages.length;
  // Surface the PDK + interactive RUN_TO knobs so they're visible in the
  // metrics.json tab and the signoff summary can show which library the
  // numbers were produced against.
  metrics['flow__pdk'] = cfg.PDK;
  metrics['flow__pdk_std_cell_lib'] = pdk.stdCellLib;
  metrics['flow__pdk_node'] = pdk.node;
  metrics['flow__run_to'] = cfg.RUN_TO;
  // When RUN_TO < signoff, tag the run so the UI can distinguish partial flows.
  metrics['flow__partial'] = cfg.RUN_TO === 'signoff' ? 0 : 1;

  // Build the layout snapshot the viewer tab renders.
  const layout: OpenlaneLayout = {
    chipWidth: W,
    chipHeight: H,
    cells: cells.map(c => ({
      id: c.id,
      name: c.name,
      type: c.name.includes('DFF') ? 'ff' : 'std',
      x: c.position?.x ?? 0,
      y: c.position?.y ?? 0,
      width: c.width,
      height: c.height,
    })),
    wires: routedWires,
  };

  const anyFail = stages.some(s => s.status === 'fail');
  return {
    stages,
    metrics,
    layout,
    totalRuntimeMs: Math.round(totalRuntimeMs),
    status: anyFail ? 'failed' : 'success',
  };
}
