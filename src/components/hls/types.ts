/**
 * Response types for the HLS workspace API.
 *
 * These mirror the JSON actually returned by the route modules under
 * `app/api/hls/*` (which in turn serialize the types in `src/lib/hls/*`).
 * Nothing here is computed on the client.
 */

export interface KernelParameterInfo {
  name: string;
  type: string;
  defaultValue?: number;
  value?: number;
}

export interface SourceInfo {
  hash: string;
  lines: number;
  characters: number;
}

export interface ArrayDeclInfo {
  name: string;
  type: string;
  /** Declared dimensions, outermost first. */
  dimensions: number[];
  size: number;
  elementBytes: number;
  /** True when the array is declared in the function signature. */
  argument: boolean;
  line: number;
  column: number;
}

export interface LoopInfo {
  kind: 'loop';
  id: string;
  parentId: string | null;
  depth: number;
  varName: string;
  start: number;
  step: number;
  comparison: string;
  bound: number;
  boundText: string;
  tripCount: number;
  childLoopIds: string[];
  /** Primitive ops in this loop and all nested loops. */
  opCount: number;
  ownOpCount: number;
  arrayAccessCount: number;
  line: number;
  column: number;
}

export interface PrimitiveOpInfo {
  id: string;
  loopPath: string[];
  op: string;
  reads: string[];
  writes: string[];
  loopVars: string[];
  arrayReads: string[];
  arrayWrites: string[];
  arithmetic: string[];
  line: number;
  column: number;
}

export interface ScalarInfo {
  name: string;
  line: number;
  column: number;
  reads: number;
  writes: number;
  loopIds: string[];
  initialValue?: number;
  /** Conservative read-before-write / self-update detection. */
  loopCarried: boolean;
  /** `x = x + ...` (or compound equivalent); a reduction candidate. */
  reduction: boolean;
}

export interface AnalyzeResponse {
  label: string;
  note: string;
  irVersion: number;
  subset: string[];
  notes: string[];
  name: string;
  source: SourceInfo;
  parameters: KernelParameterInfo[];
  arrays: ArrayDeclInfo[];
  loops: LoopInfo[];
  operations: PrimitiveOpInfo[];
  scalars: ScalarInfo[];
  opMix: Record<string, number>;
  maxLoopDepth: number;
}

/* --------------------------------------------------------------- estimate */

export interface EstimateCostPoint {
  loopId: string;
  parentId: string | null;
  depth: number;
  tripCount: number;
  parallelFactor: number;
  unrollFactor: number;
  pipelineII: number;
  tileFactor: number;
  lanes: number;
  iterations: number;
  ownOpCount: number;
  innerCycles: number;
  loopCycles: number;
}

export interface EstimateResources {
  dsp: number;
  lut: number;
  ff: number;
  bram: number;
  replicatedOps: number;
}

export interface EstimateScores {
  latency: number;
  area: number;
  memory: number;
  power: number;
}

export interface Estimate {
  estimatorVersion: number;
  label: string;
  designPoint: { id: string; pragmaKey: string };
  latencyCycles: number;
  /** Fraction of cycles in which the datapath is modelled as active (0..1]. */
  activity: number;
  resources: EstimateResources;
  memoryTrafficBytes: number;
  memoryTrafficElements: number;
  scores: EstimateScores;
  opMix: Record<string, number>;
  loopBreakdown: EstimateCostPoint[];
  straightLineOps: number;
  assumptions: string[];
  caveats: string[];
}

export interface LoopPragma {
  loopId: string;
  tileable: boolean;
  parallelFactor: number;
  pipelineII: number;
  unrollFactor: number;
  tileFactor: number;
}

export interface EstimateResponse {
  designPoint: {
    id: string;
    pragmaKey: string;
    loopPragmas: LoopPragma[];
    directives: string[];
  };
  estimate: Estimate;
  note: string;
}

/* --------------------------------------------------------- design space */

export interface DesignSpaceOptions {
  parallelFactors: number[];
  pipelineIIs: number[];
  unrollFactors: number[];
  tileFactors: number[];
  maxPoints: number;
}

export interface RankedDesignPoint {
  id: string;
  index: number;
  rank: number;
  pareto: boolean;
  weightedScore: number;
  dominates: number;
  dominatedBy: number;
  pragmaKey: string;
  loopPragmas: LoopPragma[];
  directives: string[];
  estimate: {
    label: string;
    latencyCycles: number;
    resources: EstimateResources;
    memoryTrafficBytes: number;
    scores: EstimateScores;
  };
}

export interface PragmasResponse {
  label: string;
  note: string;
  designSpace: {
    kernel: { name: string; loops: number; ops: number };
    options: DesignSpaceOptions;
    totalCombinations: number;
    totalCombinationsCapped: boolean;
    sampled: boolean;
    samplingStride: number;
    returned: number;
    truncatedToLimit: boolean;
    notes: string[];
  };
  totalRanked: number;
  ranked: RankedDesignPoint[];
}

/* -------------------------------------------------------------------- rtl */

export interface RtlLimits {
  maxCopiesPerLoop: number;
  maxStates: number;
  maxOpInstances: number;
  emittedStates: number;
  emittedOpInstances: number;
  truncated: boolean;
}

export interface RtlToolRun {
  tool: 'yosys' | 'iverilog';
  /** The route's own honesty label for this tool run. */
  label: string;
  command: string;
  available: boolean;
  ran: boolean;
  ok: boolean;
  skippedReason?: string;
  exitCode: number | null;
  stdoutTail: string;
  stderrTail: string;
  durationMs: number;
}

export type RtlVerification =
  | { performed: true; yosys: RtlToolRun; iverilog: RtlToolRun }
  | { performed: false; note: string; yosys: null; iverilog: null };

export interface RtlResponse {
  label: string;
  note: string;
  top: string;
  testbenchName: string;
  designPoint: { id: string; pragmaKey: string; directives: string[] };
  limits: RtlLimits;
  notes: string[];
  verilog: string;
  testbench: string;
  verification: RtlVerification;
}

/* --------------------------------------------------------------- refactor */

export type RefactorSeverity = 'error' | 'warning' | 'info';

export interface RefactorFinding {
  code: string;
  severity: RefactorSeverity;
  message: string;
  suggestion: string;
  line: number;
  column: number;
  evidence: string;
}

export interface RefactorCounts {
  errors: number;
  warnings: number;
  infos: number;
}

export interface RefactorAnalysis {
  label: string;
  source: SourceInfo;
  functions: Array<{ name: string; line: number; column: number; bodyStart: number; bodyEnd: number }>;
  findings: RefactorFinding[];
  counts: RefactorCounts;
  heuristicVerdict: string;
  notes: string[];
}

export interface RefactorDraftResponse {
  label: string;
  model: string;
  analysis: RefactorAnalysis;
  draft: {
    rewrittenSource: string;
    testbench: string;
    rationale: string;
    caveats: string[];
    retainedBehavior?: string[];
  };
  draftScan: { counts: RefactorCounts; heuristicVerdict: string };
  verification: { performed: false; note: string };
  notes: string[];
}

/* ---------------------------------------------------------------- editing */

/** Client-side loop pragma draft; matches the API's loopPragmaSchema. */
export interface LoopPragmaEditing {
  loopId: string;
  parallelFactor: number;
  pipelineII: number;
  unrollFactor: number;
  tileFactor: number;
}

export interface ParameterRow {
  name: string;
  value: string;
}
