/**
 * Multi-mode multi-corner (MMMC) static timing analysis.
 *
 * A commercial STA engine signs off a design by running it across every
 * combination of:
 *   - operating mode       (functional, scan, test, ...)
 *   - process corner       (ss/tt/ff silicon)
 *   - voltage              (nominal, low-VDD droop, ...)
 *   - temperature          (125°C / −40°C)
 *   - RC corner            (c-worst, rc-best, ...)
 *
 * This implementation runs a simple Elmore-based STA per corner, applying
 * each corner's PVT derating factors to cell delay, wire delay, and clock
 * uncertainty, then reports WNS / TNS and the top-N critical paths per
 * corner, plus the worst-of-corners aggregate.
 *
 * Inputs are deliberately minimal (netlist + a list of PathArcs) so this
 * file is testable in isolation without the full placer/router state. The
 * integration layer that builds PathArcs from the chip_design Design type
 * lives in a follow-up file; this module is pure calculation.
 */

export interface Corner {
  id: string;
  mode: string;                       // 'functional' | 'scan' | ...
  process: 'ss' | 'tt' | 'ff' | string;
  voltage: number;                    // V
  temperature: number;                // °C
  rcCorner: 'c-worst' | 'c-best' | 'rc-typ' | string;
  /** Multiplier on cell delays (e.g. 1.25 for slow, 0.8 for fast). */
  cellDerate: number;
  /** Multiplier on wire delays. */
  wireDerate: number;
  /** Added uncertainty on every clock edge (ps). */
  clockUncertainty: number;
}

/** One logical arc along a timing path. */
export interface PathArc {
  id: string;
  /** Free-form source & sink pin names. */
  from: string;
  to: string;
  /** Intrinsic cell delay at nominal conditions (ps). */
  cellDelay: number;
  /** Wire delay for the net connecting this arc's cells (ps). */
  wireDelay: number;
}

/** A full launch-to-capture path. */
export interface TimingPath {
  id: string;
  /** Required-arrival-time at the capture flop (ps). */
  required: number;
  /** Launch clock insertion (ps). */
  launchDelay: number;
  /** Capture clock insertion (ps). */
  captureDelay: number;
  /** Ordered arcs from launch to capture. */
  arcs: PathArc[];
}

export interface CornerPathResult {
  cornerId: string;
  pathId: string;
  arrival: number;
  required: number;
  slack: number;
}

export interface MmmcResult {
  /** Per (corner, path) slack. */
  perPath: CornerPathResult[];
  /** Corner-level summary: WNS & TNS for this corner. */
  perCorner: {
    cornerId: string;
    wns: number;
    tns: number;
    /** Top-N most critical paths at this corner. */
    worstPaths: CornerPathResult[];
  }[];
  /** Aggregated worst-of-corners numbers. */
  worstWNS: { cornerId: string; pathId: string; slack: number };
  totalTNS: number;
}

export interface MmmcOptions {
  /** How many critical paths to report per corner (by slack ascending). */
  worstN?: number;
}

/**
 * Main entry point — runs STA over every corner and returns slack numbers.
 */
export function runMMMC(
  corners: Corner[],
  paths: TimingPath[],
  opts: MmmcOptions = {},
): MmmcResult {
  const worstN = opts.worstN ?? 10;

  const perPath: CornerPathResult[] = [];
  const perCorner: MmmcResult['perCorner'] = [];
  let worstSlack = Infinity;
  let worstHolder: { cornerId: string; pathId: string; slack: number } = {
    cornerId: '', pathId: '', slack: Infinity,
  };
  let totalTNS = 0;

  for (const corner of corners) {
    const cornerRows: CornerPathResult[] = [];
    let cornerTNS = 0;
    let cornerWNS = Infinity;

    for (const path of paths) {
      const arrival = computeArrival(path, corner);
      // Required − arrival = slack. Negative slack → violation.
      const slack = path.required + path.captureDelay - arrival - corner.clockUncertainty;
      const row = { cornerId: corner.id, pathId: path.id, arrival, required: path.required, slack };
      cornerRows.push(row);
      perPath.push(row);
      if (slack < 0) cornerTNS += slack;
      if (slack < cornerWNS) cornerWNS = slack;
      if (slack < worstSlack) {
        worstSlack = slack;
        worstHolder = { cornerId: corner.id, pathId: path.id, slack };
      }
    }
    const worstPaths = [...cornerRows]
      .sort((a, b) => a.slack - b.slack)
      .slice(0, worstN);
    perCorner.push({
      cornerId: corner.id,
      wns: cornerRows.length > 0 ? cornerWNS : 0,
      tns: cornerTNS,
      worstPaths,
    });
    totalTNS += cornerTNS;
  }

  return { perPath, perCorner, worstWNS: worstHolder, totalTNS };
}

/** Sum derated cell + wire delays along a path plus the launch edge. */
export function computeArrival(path: TimingPath, corner: Corner): number {
  let t = path.launchDelay;
  for (const arc of path.arcs) {
    t += arc.cellDelay * corner.cellDerate;
    t += arc.wireDelay * corner.wireDerate;
  }
  return t;
}

/**
 * Helper — construct a set of "textbook" corners (slow / typical / fast)
 * with sensible defaults. Useful for tests and for UIs that don't need a
 * full MMMC spec.
 */
export function defaultCorners(): Corner[] {
  return [
    { id: 'ss_0p81_125',  mode: 'functional', process: 'ss',
      voltage: 0.81, temperature: 125,
      rcCorner: 'c-worst', cellDerate: 1.25, wireDerate: 1.20,
      clockUncertainty: 50 },
    { id: 'tt_0p90_25',   mode: 'functional', process: 'tt',
      voltage: 0.90, temperature: 25,
      rcCorner: 'rc-typ', cellDerate: 1.00, wireDerate: 1.00,
      clockUncertainty: 30 },
    { id: 'ff_0p99_m40',  mode: 'functional', process: 'ff',
      voltage: 0.99, temperature: -40,
      rcCorner: 'c-best', cellDerate: 0.80, wireDerate: 0.85,
      clockUncertainty: 20 },
  ];
}
