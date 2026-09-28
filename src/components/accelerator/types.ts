/**
 * Response types for the accelerator workspaces (systolic GEMM generator and
 * polyhedral loop-nest explorer). These mirror `src/lib/accelerator/*`.
 */

export type SystolicPrecision = 4 | 8 | 16 | 32;
export type SystolicDataflow = 'weight-stationary' | 'output-stationary';

export interface SystolicConfig {
  M: number;
  N: number;
  K: number;
  tileRows: number;
  tileCols: number;
  dataflow: SystolicDataflow;
  dataWidthBits: SystolicPrecision;
  accWidthBits: SystolicPrecision;
}

export interface SystolicCycleBreakdown {
  dataflow: SystolicDataflow;
  tiles: number;
  tilesM: number;
  tilesN: number;
  tilesK: number;
  computeCyclesPerTile: number;
  drainCyclesPerTile: number;
  weightLoadCyclesPerTile: number;
  startupCycles: number;
  totalCycles: number;
  formula: string;
}

export interface SystolicUtilization {
  macUnits: number;
  usefulMacs: number;
  peakMacSlots: number;
  arrayUtilizationPct: number;
  computeWindowUtilizationPct: number;
  peSteadyStateUtilizationPct: number;
  boundaryReadsPerCycle: number;
  boundaryWritesPerCycle: number;
  operandBytes: number;
  cBytes: number;
}

export interface SystolicResponse {
  verilog: string;
  testbench: string;
  topModule: string;
  peModule: string;
  cycles: number;
  cyclesBreakdown: SystolicCycleBreakdown;
  utilization: SystolicUtilization;
  notes: string[];
}

/* -------------------------------------------------------------- polyhedral */

export interface PolyhedralLoop {
  name: string;
  lower: number;
  upper: number;
  step: number;
  extent: number;
}

export interface PolyhedralDependenceVector {
  /** Distance vector in the original loop order; all zero vectors are excluded. */
  delta: number[];
  arrays: string[];
  occurrences: number;
}

export interface PolyhedralSchedule {
  id: string;
  loopOrder: string[];
  tileFactors: Record<string, number>;
  tileShape: number[];
  transformedListing: string;
  tileCount: number;
  tileIterations: number;
  totalIterations: number;
  l2TrafficBytes: number;
  requestedBytes: number;
  linesFromL2: number;
  linesTouched: number;
  accessesPerLine: number;
  requestBytesPerL2Byte: number;
  maxWorkingSetBytes: number;
  spillPasses: number;
  fitsFastMemory: boolean;
  arithmeticIntensityOpsPerByte: number;
  dominated: boolean;
  paretoRank: number | null;
}

export interface PolyhedralResponse {
  loops: PolyhedralLoop[];
  arrayShapes: Record<string, { shape: number[]; strides: number[] }>;
  dependenceVectors: PolyhedralDependenceVector[];
  dependenceVectorCount: number;
  legalOrders: string[][];
  candidateCount: number;
  evaluatedCount: number;
  truncated: boolean;
  schedules: PolyhedralSchedule[];
  pareto: string[];
  notes: string[];
}
