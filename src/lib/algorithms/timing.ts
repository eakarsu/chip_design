/**
 * Structural timing estimation.
 *
 * This is deliberately *not* sign-off static timing analysis: there is no
 * Liberty/SDF library in this project and the `netlist` string is not
 * elaborated into a gate-level timing graph. What this module does provide is
 * a deterministic, first-order estimate derived from the cells' geometry and
 * pin counts plus the wire geometry, so the UI gets a stable, reproducible
 * number instead of random samples.
 *
 * The previous implementation generated "paths" with random gate delays and a
 * random clock skew. That was neither static timing analysis nor reproducible;
 * it has been replaced by the structural model below.
 *
 * Model (documented constants, all delays in the same abstract time unit as
 * `clockPeriod`):
 *
 *   stage delay      = BASE + SIZE_PER_UNIT·(width + height) + PIN_LOAD·pins
 *   interconnect     = WIRE_PER_LENGTH · total wire length
 *   worst-case path  = every stage in left-to-right (x, y, id) order, which
 *                      is the conservative bound when the real netlist
 *                      connectivity is not available
 *   best-case delay  = the smallest stage delay
 *   clock skew       = a fraction of the total interconnect length
 *
 * Use a real STA tool (OpenSTA/PrimeTime) for sign-off; this is an estimate.
 */

import { Cell, TimingParams, TimingResult, TimingAlgorithm, Wire } from '@/types/algorithms';

const BASE_STAGE_DELAY = 0.8;
const SIZE_DELAY_PER_UNIT = 0.02;
const PIN_LOAD_DELAY = 0.05;
const WIRE_DELAY_PER_LENGTH = 0.001;
const SKEW_PER_WIRE_LENGTH = 0.01;

function stageDelay(cell: Cell): number {
  return (
    BASE_STAGE_DELAY +
    SIZE_DELAY_PER_UNIT * (cell.width + cell.height) +
    PIN_LOAD_DELAY * cell.pins.length
  );
}

function totalWireLength(wires: Wire[]): number {
  let length = 0;
  for (const wire of wires) {
    for (let i = 1; i < wire.points.length; i++) {
      const dx = wire.points[i].x - wire.points[i - 1].x;
      const dy = wire.points[i].y - wire.points[i - 1].y;
      length += Math.sqrt(dx * dx + dy * dy);
    }
  }
  return length;
}

/** Deterministic signal-flow order: left to right, then top to bottom, then id. */
function orderedCells(cells: Cell[]): Cell[] {
  return [...cells].sort((a, b) => {
    const ax = a.position?.x ?? 0;
    const bx = b.position?.x ?? 0;
    if (ax !== bx) return ax - bx;
    const ay = a.position?.y ?? 0;
    const by = b.position?.y ?? 0;
    if (ay !== by) return ay - by;
    return a.id.localeCompare(b.id);
  });
}

interface StructuralTiming {
  criticalPath: string[];
  maxDelay: number;
  minDelay: number;
  clockSkew: number;
}

function analyzeStructure(params: TimingParams): StructuralTiming {
  const ordered = orderedCells(params.cells);
  const delays = ordered.map(stageDelay);
  const wireDelay = totalWireLength(params.wires) * WIRE_DELAY_PER_LENGTH;

  const maxDelay = delays.reduce((sum, d) => sum + d, 0) + wireDelay;
  const minDelay = delays.length > 0 ? Math.min(...delays) : 0;
  const clockSkew = Math.min(
    Math.max(0, params.clockPeriod * 0.5),
    totalWireLength(params.wires) * SKEW_PER_WIRE_LENGTH
  );

  return {
    criticalPath: ordered.map((c) => c.id),
    maxDelay,
    minDelay,
    clockSkew,
  };
}

/**
 * Static timing estimate: worst-case path delay, slack against the clock
 * period and a deterministic interconnect-skew estimate.
 */
export function staticTimingAnalysis(params: TimingParams): TimingResult {
  const startTime = performance.now();
  const { criticalPath, maxDelay, minDelay, clockSkew } = analyzeStructure(params);

  const slackTime = params.clockPeriod - maxDelay;
  const setupViolations = slackTime < 0 ? 1 : 0;
  const holdViolations = 0;

  const runtime = performance.now() - startTime;

  return {
    success: setupViolations === 0,
    criticalPath,
    slackTime,
    setupViolations,
    holdViolations,
    maxDelay,
    minDelay,
    clockSkew,
    runtime,
  };
}

/**
 * Critical-path estimate: the same structural model, reported as the
 * conservative worst-case chain of stages plus the shortest single stage.
 */
export function criticalPathAnalysis(params: TimingParams): TimingResult {
  const startTime = performance.now();
  const { criticalPath, maxDelay, minDelay, clockSkew } = analyzeStructure(params);

  const slackTime = params.clockPeriod - maxDelay;
  const setupViolations = slackTime < 0 ? 1 : 0;

  const runtime = performance.now() - startTime;

  return {
    success: setupViolations === 0,
    criticalPath,
    slackTime,
    setupViolations,
    holdViolations: 0,
    maxDelay,
    minDelay,
    clockSkew,
    runtime,
  };
}

// Main timing dispatcher
export function runTiming(params: TimingParams): TimingResult {
  switch (params.algorithm) {
    case TimingAlgorithm.STATIC_TIMING_ANALYSIS:
      return staticTimingAnalysis(params);
    case TimingAlgorithm.CRITICAL_PATH:
      return criticalPathAnalysis(params);
    default:
      throw new Error(`Unsupported timing algorithm: ${params.algorithm}`);
  }
}
