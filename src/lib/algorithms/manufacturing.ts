/**
 * Manufacturing-aware analyses: Signal Integrity (SI), IR Drop,
 * Lithography (OPC/PSM/SRAF), and CMP (dummy fill, density balancing).
 *
 * These used to dispatch to DRC/ERC as a stub. Each implementation below is
 * a simplified but real physical model — good enough to produce meaningful
 * violation reports from a cells+wires layout, and to exercise the rest of
 * the UI without pretending.
 */

import {
  DRCLVSParams,
  DRCLVSResult,
  Cell,
  Wire,
  Point,
} from '@/types/algorithms';

interface Violation {
  rule: string;
  severity: 'error' | 'warning';
  location: Point;
  message: string;
  affectedObjects: string[];
}

function finish(
  startTime: number,
  violations: Violation[],
  checkedObjects: number,
): DRCLVSResult {
  const errorCount = violations.filter(v => v.severity === 'error').length;
  const warningCount = violations.filter(v => v.severity === 'warning').length;
  return {
    success: errorCount === 0,
    violations,
    errorCount,
    warningCount,
    checkedObjects,
    runtime: performance.now() - startTime,
  };
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

interface Segment {
  wire: Wire;
  a: Point;
  b: Point;
  /** 'h' horizontal, 'v' vertical, 'd' diagonal. */
  orient: 'h' | 'v' | 'd';
}

function wireSegments(wires: Wire[]): Segment[] {
  const segs: Segment[] = [];
  for (const w of wires) {
    for (let i = 0; i + 1 < w.points.length; i++) {
      const a = w.points[i];
      const b = w.points[i + 1];
      const orient: 'h' | 'v' | 'd' =
        a.y === b.y ? 'h' :
        a.x === b.x ? 'v' : 'd';
      segs.push({ wire: w, a, b, orient });
    }
  }
  return segs;
}

/** Parallel-run length between two same-orientation segments on the same
 *  layer, together with their perpendicular spacing. */
function parallelRun(s1: Segment, s2: Segment): { length: number; spacing: number } | null {
  if (s1.wire.layer !== s2.wire.layer) return null;
  if (s1.orient !== s2.orient) return null;
  if (s1.orient === 'd') return null;

  if (s1.orient === 'h') {
    const spacing = Math.abs(s1.a.y - s2.a.y);
    const x1lo = Math.min(s1.a.x, s1.b.x), x1hi = Math.max(s1.a.x, s1.b.x);
    const x2lo = Math.min(s2.a.x, s2.b.x), x2hi = Math.max(s2.a.x, s2.b.x);
    const length = Math.max(0, Math.min(x1hi, x2hi) - Math.max(x1lo, x2lo));
    return length > 0 ? { length, spacing } : null;
  } else {
    const spacing = Math.abs(s1.a.x - s2.a.x);
    const y1lo = Math.min(s1.a.y, s1.b.y), y1hi = Math.max(s1.a.y, s1.b.y);
    const y2lo = Math.min(s2.a.y, s2.b.y), y2hi = Math.max(s2.a.y, s2.b.y);
    const length = Math.max(0, Math.min(y1hi, y2hi) - Math.max(y1lo, y2lo));
    return length > 0 ? { length, spacing } : null;
  }
}

function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

// ---------------------------------------------------------------------------
// Signal Integrity
// ---------------------------------------------------------------------------

/** Physical constants (approximate, for a modern planar process). */
const EPS0_FF_PER_UM = 8.854e-3;    // fF/µm (vacuum permittivity scaled)
const K_DIELECTRIC   = 3.9;         // relative permittivity of SiO₂-like ILD
const METAL_THICKNESS_UM = 0.18;

/** Coupling capacitance between two parallel run segments, in fF.
 *  Simple parallel-plate approximation: C = ε₀ k t L / d.   */
function couplingCap(lengthUm: number, spacingUm: number): number {
  if (spacingUm <= 0) return Number.POSITIVE_INFINITY;
  return EPS0_FF_PER_UM * K_DIELECTRIC * METAL_THICKNESS_UM * lengthUm / spacingUm;
}

export function couplingCapacitanceAnalysis(params: DRCLVSParams): DRCLVSResult {
  const start = performance.now();
  const violations: Violation[] = [];
  const segs = wireSegments(params.wires);

  // Threshold: anything above 10 fF of coupling between two nets is flagged.
  const CAP_THRESHOLD_FF = 10;

  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      const s1 = segs[i], s2 = segs[j];
      if (s1.wire.netId === s2.wire.netId) continue;
      const pr = parallelRun(s1, s2);
      if (!pr || pr.spacing === 0) continue;
      const cap = couplingCap(pr.length, pr.spacing);
      if (cap >= CAP_THRESHOLD_FF) {
        violations.push({
          rule: 'HIGH_COUPLING_CAPACITANCE',
          severity: cap >= CAP_THRESHOLD_FF * 2 ? 'error' : 'warning',
          location: midpoint(s1.a, s1.b),
          message:
            `Nets ${s1.wire.netId} / ${s2.wire.netId}: ` +
            `Cc ≈ ${cap.toFixed(2)} fF over ${pr.length.toFixed(2)} µm @ ${pr.spacing.toFixed(3)} µm spacing`,
          affectedObjects: [s1.wire.id, s2.wire.id],
        });
      }
    }
  }
  return finish(start, violations, params.cells.length + params.wires.length);
}

export function crosstalkAnalysis(params: DRCLVSParams): DRCLVSResult {
  const start = performance.now();
  const violations: Violation[] = [];
  const segs = wireSegments(params.wires);

  // Victim-net self-capacitance estimate (proportional to wire length).
  const selfCap = new Map<string, number>();
  for (const s of segs) {
    const len = Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y);
    // Rough ground capacitance: 0.2 fF/µm.
    selfCap.set(s.wire.netId, (selfCap.get(s.wire.netId) ?? 0) + 0.2 * len);
  }

  // Crosstalk noise amplitude: Vnoise/Vdd ≈ Cc / (Cc + Cg). A switching
  // aggressor injects up to this fraction of VDD onto the victim.
  const COUPLING_RATIO_LIMIT = 0.15; // 15% of VDD

  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      const s1 = segs[i], s2 = segs[j];
      if (s1.wire.netId === s2.wire.netId) continue;
      const pr = parallelRun(s1, s2);
      if (!pr || pr.spacing === 0) continue;
      const cc = couplingCap(pr.length, pr.spacing);
      // Evaluate ratio for each as the potential victim.
      for (const [victim, aggressor] of [[s1, s2], [s2, s1]] as const) {
        const cg = selfCap.get(victim.wire.netId) ?? 1;
        const ratio = cc / (cc + cg);
        if (ratio >= COUPLING_RATIO_LIMIT) {
          violations.push({
            rule: 'CROSSTALK_NOISE',
            severity: ratio >= 0.25 ? 'error' : 'warning',
            location: midpoint(victim.a, victim.b),
            message:
              `Victim ${victim.wire.netId} from aggressor ${aggressor.wire.netId}: ` +
              `noise ≈ ${(ratio * 100).toFixed(1)}% VDD (Cc=${cc.toFixed(2)} fF, Cg=${cg.toFixed(2)} fF)`,
            affectedObjects: [victim.wire.id, aggressor.wire.id],
          });
        }
      }
    }
  }
  return finish(start, violations, params.cells.length + params.wires.length);
}

export function noiseAnalysis(params: DRCLVSParams): DRCLVSResult {
  // Noise is a synthesis of crosstalk + leakage paths. For now, combine
  // crosstalk violations with a check for floating / unterminated nets.
  const start = performance.now();
  const { violations: xtViols } = crosstalkAnalysis(params);
  const violations: Violation[] = [...xtViols];

  // Unterminated nets (no wires attached) — susceptible to noise.
  const netsWithWires = new Set(params.wires.map(w => w.netId));
  for (const c of params.cells) {
    for (const pin of c.pins) {
      // Heuristic: pins whose name looks like a net id not in wires.
      if (!netsWithWires.has(pin.id)) {
        violations.push({
          rule: 'UNTERMINATED_NET',
          severity: 'warning',
          location: c.position ?? { x: 0, y: 0 },
          message: `Pin ${c.id}/${pin.name} may be noise-susceptible (no terminating wire)`,
          affectedObjects: [c.id, pin.id],
        });
      }
    }
  }
  return finish(start, violations, params.cells.length + params.wires.length);
}

// ---------------------------------------------------------------------------
// IR Drop
// ---------------------------------------------------------------------------

/** IR drop estimate per region using a coarse power-mesh model.
 *
 *   - Divide the chip into an N×N grid.
 *   - Current draw per cell = (width * height) * CURRENT_DENSITY_A_PER_UM2
 *   - Voltage drop ≈ I * R_sheet * L / W where we approximate L as distance
 *     from cell to the nearest VDD stripe (edge of chip), and R as the
 *     supply-stripe sheet resistance.
 */
export function irDropAnalysis(params: DRCLVSParams): DRCLVSResult {
  const start = performance.now();
  const violations: Violation[] = [];
  const cells = params.cells;

  // Infer chip extent from cell bboxes (pad 10%).
  let xmin = Infinity, ymin = Infinity, xmax = -Infinity, ymax = -Infinity;
  for (const c of cells) {
    const p = c.position ?? { x: 0, y: 0 };
    xmin = Math.min(xmin, p.x);
    ymin = Math.min(ymin, p.y);
    xmax = Math.max(xmax, p.x + c.width);
    ymax = Math.max(ymax, p.y + c.height);
  }
  if (!Number.isFinite(xmin)) {
    return finish(start, violations, 0);
  }
  const spanX = Math.max(1, xmax - xmin);
  const spanY = Math.max(1, ymax - ymin);

  const CURRENT_DENSITY = 1e-5;   // A/µm² of cell area — very rough
  const R_SHEET         = 0.05;   // Ω/sq — copper Mtop equivalent
  const VDD             = 0.9;    // V
  const MAX_DROP_V      = VDD * 0.05; // 5% of VDD budget

  for (const c of cells) {
    const p = c.position ?? { x: 0, y: 0 };
    const I = c.width * c.height * CURRENT_DENSITY;
    // Distance to nearest stripe (chip edge).
    const distToLeft   = p.x - xmin + 1;
    const distToRight  = xmax - (p.x + c.width) + 1;
    const distToBot    = p.y - ymin + 1;
    const distToTop    = ymax - (p.y + c.height) + 1;
    const L = Math.min(distToLeft, distToRight, distToBot, distToTop);
    const W = Math.max(c.width, c.height); // stripe feed width proxy
    const R = R_SHEET * L / Math.max(1, W);
    const drop = I * R;
    if (drop > MAX_DROP_V) {
      violations.push({
        rule: 'IR_DROP_BUDGET_EXCEEDED',
        severity: drop > MAX_DROP_V * 2 ? 'error' : 'warning',
        location: p,
        message:
          `Cell ${c.id}: IR drop ≈ ${(drop * 1000).toFixed(2)} mV ` +
          `(budget ${(MAX_DROP_V * 1000).toFixed(0)} mV, I≈${(I * 1e6).toFixed(2)} µA, R≈${R.toFixed(2)} Ω)`,
        affectedObjects: [c.id],
      });
    }
  }
  // Report overall span and stripe pitch for visibility.
  void spanX; void spanY;
  return finish(start, violations, cells.length);
}

// ---------------------------------------------------------------------------
// Lithography: OPC / PSM / SRAF
// ---------------------------------------------------------------------------

/** OPC: flag every convex corner and every line-end. In a real flow these
 *  are where you'd add serifs/hammerheads. We report as informational
 *  warnings with pre-computed bias amounts. */
export function opcAnalysis(params: DRCLVSParams): DRCLVSResult {
  const start = performance.now();
  const violations: Violation[] = [];
  const MIN_FEATURE_UM = 0.065;
  const SERIF_BIAS_UM = 0.02;
  const HAMMERHEAD_BIAS_UM = 0.04;

  // Cells: each bbox has four convex corners → add serifs.
  for (const c of cells(params)) {
    const p = c.position ?? { x: 0, y: 0 };
    const corners: Point[] = [
      { x: p.x, y: p.y },
      { x: p.x + c.width, y: p.y },
      { x: p.x, y: p.y + c.height },
      { x: p.x + c.width, y: p.y + c.height },
    ];
    for (const cn of corners) {
      violations.push({
        rule: 'OPC_SERIF_REQUIRED',
        severity: 'warning',
        location: cn,
        message: `Add serif (+${SERIF_BIAS_UM.toFixed(3)} µm) at corner of ${c.id}`,
        affectedObjects: [c.id],
      });
    }
    if (Math.min(c.width, c.height) < MIN_FEATURE_UM * 2) {
      violations.push({
        rule: 'OPC_FEATURE_TOO_SMALL',
        severity: 'error',
        location: p,
        message: `Cell ${c.id} dimensions below OPC-correctable limit (${MIN_FEATURE_UM * 2} µm)`,
        affectedObjects: [c.id],
      });
    }
  }

  // Wires: every endpoint is a line-end → add hammerhead.
  for (const w of params.wires) {
    if (w.points.length === 0) continue;
    const firstP = w.points[0];
    const lastP = w.points[w.points.length - 1];
    for (const pt of [firstP, lastP]) {
      violations.push({
        rule: 'OPC_HAMMERHEAD_REQUIRED',
        severity: 'warning',
        location: pt,
        message:
          `Add hammerhead (+${HAMMERHEAD_BIAS_UM.toFixed(3)} µm) at line-end of ${w.id}`,
        affectedObjects: [w.id],
      });
    }
  }
  return finish(start, violations, params.cells.length + params.wires.length);
}

/** PSM: detect dense, pitch-critical wire pairs that benefit from phase-shift
 *  assists. Pairs closer than λ/NA pitch are candidates. */
export function phaseShiftMaskingAnalysis(params: DRCLVSParams): DRCLVSResult {
  const start = performance.now();
  const violations: Violation[] = [];
  // 193 nm / 1.35 NA → ~143 nm (0.143 µm). Any pitch below this needs PSM.
  const CRITICAL_PITCH_UM = 0.143;
  const segs = wireSegments(params.wires);
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      const pr = parallelRun(segs[i], segs[j]);
      if (!pr) continue;
      const pitch = pr.spacing + segs[i].wire.width; // spacing + line width
      if (pitch < CRITICAL_PITCH_UM && pr.length > 0) {
        violations.push({
          rule: 'PSM_ASSIST_REQUIRED',
          severity: 'warning',
          location: midpoint(segs[i].a, segs[i].b),
          message:
            `Pitch ${(pitch * 1000).toFixed(0)} nm between ${segs[i].wire.id} / ${segs[j].wire.id} ` +
            `is below critical ${CRITICAL_PITCH_UM * 1000} nm — assign alternating phase`,
          affectedObjects: [segs[i].wire.id, segs[j].wire.id],
        });
      }
    }
  }
  return finish(start, violations, params.cells.length + params.wires.length);
}

/** SRAF: find isolated lines (no same-layer neighbour within a window) and
 *  recommend sub-resolution assist features. */
export function srafAnalysis(params: DRCLVSParams): DRCLVSResult {
  const start = performance.now();
  const violations: Violation[] = [];
  const ISOLATION_WINDOW_UM = 0.3;
  const segs = wireSegments(params.wires);
  for (let i = 0; i < segs.length; i++) {
    let isolated = true;
    for (let j = 0; j < segs.length && isolated; j++) {
      if (i === j) continue;
      const pr = parallelRun(segs[i], segs[j]);
      if (pr && pr.spacing <= ISOLATION_WINDOW_UM) isolated = false;
    }
    if (isolated) {
      violations.push({
        rule: 'SRAF_RECOMMENDED',
        severity: 'warning',
        location: midpoint(segs[i].a, segs[i].b),
        message:
          `Wire ${segs[i].wire.id} is isolated within ${ISOLATION_WINDOW_UM} µm — ` +
          `add sub-resolution assist features to improve depth-of-focus`,
        affectedObjects: [segs[i].wire.id],
      });
    }
  }
  return finish(start, violations, params.cells.length + params.wires.length);
}

// ---------------------------------------------------------------------------
// CMP: density balancing, dummy fill, CMP-aware routing
// ---------------------------------------------------------------------------

/** Build an N×N density grid of metal coverage (per the wire layer). */
function densityGrid(params: DRCLVSParams, N: number): {
  grid: number[][];      // fractional density per tile
  tileW: number;
  tileH: number;
  x0: number; y0: number;
} {
  let xmin = Infinity, ymin = Infinity, xmax = -Infinity, ymax = -Infinity;
  for (const c of params.cells) {
    const p = c.position ?? { x: 0, y: 0 };
    xmin = Math.min(xmin, p.x); ymin = Math.min(ymin, p.y);
    xmax = Math.max(xmax, p.x + c.width); ymax = Math.max(ymax, p.y + c.height);
  }
  for (const w of params.wires) {
    for (const p of w.points) {
      xmin = Math.min(xmin, p.x); ymin = Math.min(ymin, p.y);
      xmax = Math.max(xmax, p.x); ymax = Math.max(ymax, p.y);
    }
  }
  if (!Number.isFinite(xmin)) {
    return { grid: [], tileW: 0, tileH: 0, x0: 0, y0: 0 };
  }
  const tileW = Math.max(1e-6, (xmax - xmin) / N);
  const tileH = Math.max(1e-6, (ymax - ymin) / N);
  const grid: number[][] = Array.from({ length: N }, () => Array(N).fill(0));

  const indexOf = (x: number, y: number): [number, number] => [
    Math.max(0, Math.min(N - 1, Math.floor((x - xmin) / tileW))),
    Math.max(0, Math.min(N - 1, Math.floor((y - ymin) / tileH))),
  ];
  const tileArea = tileW * tileH;

  // Cell contributions.
  for (const c of params.cells) {
    const p = c.position ?? { x: 0, y: 0 };
    const [i0, j0] = indexOf(p.x, p.y);
    const [i1, j1] = indexOf(p.x + c.width, p.y + c.height);
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const xl = Math.max(p.x, xmin + i * tileW);
        const xh = Math.min(p.x + c.width, xmin + (i + 1) * tileW);
        const yl = Math.max(p.y, ymin + j * tileH);
        const yh = Math.min(p.y + c.height, ymin + (j + 1) * tileH);
        const a = Math.max(0, xh - xl) * Math.max(0, yh - yl);
        grid[i][j] += a / tileArea;
      }
    }
  }
  // Wire contributions (thin rectangles).
  for (const w of params.wires) {
    for (let k = 0; k + 1 < w.points.length; k++) {
      const a = w.points[k], b = w.points[k + 1];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      const area = len * (w.width || 0.05);
      const m = midpoint(a, b);
      const [i, j] = indexOf(m.x, m.y);
      grid[i][j] += area / tileArea;
    }
  }
  return { grid, tileW, tileH, x0: xmin, y0: ymin };
}

export function densityBalancingAnalysis(params: DRCLVSParams): DRCLVSResult {
  const start = performance.now();
  const violations: Violation[] = [];
  const N = 16;
  const { grid, tileW, tileH, x0, y0 } = densityGrid(params, N);
  const MIN_DENS = 0.20;
  const MAX_DENS = 0.80;
  const NEIGHBOUR_DELTA_MAX = 0.25;

  for (let i = 0; i < grid.length; i++) {
    for (let j = 0; j < grid[i].length; j++) {
      const d = grid[i][j];
      const loc: Point = { x: x0 + (i + 0.5) * tileW, y: y0 + (j + 0.5) * tileH };
      if (d < MIN_DENS) {
        violations.push({
          rule: 'CMP_DENSITY_TOO_LOW',
          severity: 'warning',
          location: loc,
          message: `Tile (${i},${j}) density ${(d * 100).toFixed(1)}% < ${MIN_DENS * 100}%`,
          affectedObjects: [`tile_${i}_${j}`],
        });
      } else if (d > MAX_DENS) {
        violations.push({
          rule: 'CMP_DENSITY_TOO_HIGH',
          severity: 'error',
          location: loc,
          message: `Tile (${i},${j}) density ${(d * 100).toFixed(1)}% > ${MAX_DENS * 100}%`,
          affectedObjects: [`tile_${i}_${j}`],
        });
      }
      // Neighbour gradient check.
      for (const [di, dj] of [[1, 0], [0, 1]] as const) {
        const ni = i + di, nj = j + dj;
        if (ni >= grid.length || nj >= grid[0].length) continue;
        const delta = Math.abs(d - grid[ni][nj]);
        if (delta > NEIGHBOUR_DELTA_MAX) {
          violations.push({
            rule: 'CMP_DENSITY_GRADIENT',
            severity: 'warning',
            location: loc,
            message: `Density step ${(delta * 100).toFixed(1)}% between tiles (${i},${j})↔(${ni},${nj})`,
            affectedObjects: [`tile_${i}_${j}`, `tile_${ni}_${nj}`],
          });
        }
      }
    }
  }
  return finish(start, violations, params.cells.length + params.wires.length);
}

export function dummyFillAnalysis(params: DRCLVSParams): DRCLVSResult {
  const start = performance.now();
  const violations: Violation[] = [];
  const N = 16;
  const { grid, tileW, tileH, x0, y0 } = densityGrid(params, N);
  const TARGET = 0.40;   // fill up to this
  const DUMMY_AREA = tileW * tileH;
  let fillsRequired = 0;

  for (let i = 0; i < grid.length; i++) {
    for (let j = 0; j < grid[i].length; j++) {
      if (grid[i][j] < TARGET) {
        const deficit = (TARGET - grid[i][j]) * DUMMY_AREA;
        fillsRequired++;
        violations.push({
          rule: 'DUMMY_FILL_REQUIRED',
          severity: 'warning',
          location: { x: x0 + (i + 0.5) * tileW, y: y0 + (j + 0.5) * tileH },
          message:
            `Tile (${i},${j}) needs ≈ ${deficit.toFixed(2)} µm² of dummy fill ` +
            `(current ${(grid[i][j] * 100).toFixed(1)}%, target ${TARGET * 100}%)`,
          affectedObjects: [`tile_${i}_${j}`],
        });
      }
    }
  }
  void fillsRequired;
  return finish(start, violations, params.cells.length + params.wires.length);
}

export function cmpAwareRoutingAnalysis(params: DRCLVSParams): DRCLVSResult {
  // Report wires that traverse high-density tiles (routing detour candidates).
  const start = performance.now();
  const violations: Violation[] = [];
  const N = 16;
  const { grid, tileW, tileH, x0, y0 } = densityGrid(params, N);
  const HIGH = 0.70;
  for (const w of params.wires) {
    for (const p of w.points) {
      const i = Math.max(0, Math.min(N - 1, Math.floor((p.x - x0) / tileW)));
      const j = Math.max(0, Math.min(N - 1, Math.floor((p.y - y0) / tileH)));
      if (grid[i]?.[j] !== undefined && grid[i][j] > HIGH) {
        violations.push({
          rule: 'CMP_AWARE_REROUTE',
          severity: 'warning',
          location: p,
          message:
            `Wire ${w.id} crosses high-density tile (${i},${j}) at ${(grid[i][j] * 100).toFixed(1)}% — ` +
            `consider a detour to balance CMP`,
          affectedObjects: [w.id],
        });
        break; // one hit per wire is enough
      }
    }
  }
  return finish(start, violations, params.cells.length + params.wires.length);
}

// ---------------------------------------------------------------------------
// Dispatchers
// ---------------------------------------------------------------------------

function cells(params: DRCLVSParams): Cell[] { return params.cells; }

export function runSignalIntegrity(params: DRCLVSParams): DRCLVSResult {
  const a = typeof params.algorithm === 'string' ? params.algorithm.toLowerCase() : params.algorithm;
  switch (a) {
    case 'crosstalk_analysis':    return crosstalkAnalysis(params);
    case 'coupling_capacitance':  return couplingCapacitanceAnalysis(params);
    case 'noise_analysis':        return noiseAnalysis(params);
    default:                      return crosstalkAnalysis(params);
  }
}

export function runIRDrop(params: DRCLVSParams): DRCLVSResult {
  return irDropAnalysis(params);
}

export function runLithography(params: DRCLVSParams): DRCLVSResult {
  const a = typeof params.algorithm === 'string' ? params.algorithm.toLowerCase() : params.algorithm;
  switch (a) {
    case 'opc':                 return opcAnalysis(params);
    case 'phase_shift_masking': return phaseShiftMaskingAnalysis(params);
    case 'sraf':                return srafAnalysis(params);
    default:                    return opcAnalysis(params);
  }
}

export function runCMP(params: DRCLVSParams): DRCLVSResult {
  const a = typeof params.algorithm === 'string' ? params.algorithm.toLowerCase() : params.algorithm;
  switch (a) {
    case 'dummy_fill':          return dummyFillAnalysis(params);
    case 'density_balancing':   return densityBalancingAnalysis(params);
    case 'cmp_aware_routing':   return cmpAwareRoutingAnalysis(params);
    default:                    return densityBalancingAnalysis(params);
  }
}
