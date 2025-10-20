// Comprehensive chip design algorithm types and interfaces

export enum AlgorithmCategory {
  PLACEMENT = 'placement',
  ROUTING = 'routing',
  FLOORPLANNING = 'floorplanning',
  SYNTHESIS = 'synthesis',
  TIMING_ANALYSIS = 'timing_analysis',
  POWER_OPTIMIZATION = 'power_optimization',
  CLOCK_TREE = 'clock_tree',
  PARTITIONING = 'partitioning',
  DRC_LVS = 'drc_lvs',
  REINFORCEMENT_LEARNING = 'reinforcement_learning',
  LEGALIZATION = 'legalization',
  BUFFER_INSERTION = 'buffer_insertion',
  CONGESTION_ESTIMATION = 'congestion_estimation',
  SIGNAL_INTEGRITY = 'signal_integrity',
  IR_DROP = 'ir_drop',
  LITHOGRAPHY = 'lithography',
  CMP = 'cmp',
}

export enum PlacementAlgorithm {
  SIMULATED_ANNEALING = 'simulated_annealing',
  GENETIC = 'genetic',
  FORCE_DIRECTED = 'force_directed',
  QUADRATIC = 'quadratic',
  ANALYTICAL = 'analytical',
  PARTITIONING_BASED = 'partitioning_based',
  MIN_CUT = 'min_cut',
  GORDIAN = 'gordian',
  FASTPLACE = 'fastplace',
  REPLACE = 'replace',
  DREAMPLACE = 'dreamplace',
}

export enum RoutingAlgorithm {
  MAZE_ROUTING = 'maze_routing',
  CHANNEL_ROUTING = 'channel_routing',
  GLOBAL_ROUTING = 'global_routing',
  DETAILED_ROUTING = 'detailed_routing',
  A_STAR = 'a_star',
  STEINER_TREE = 'steiner_tree',
  FLUTE = 'flute',
  GEOSTEINER = 'geosteiner',
  LEFT_EDGE = 'left_edge',
  DOGLEG = 'dogleg',
  SWITCHBOX = 'switchbox',
  PATHFINDER = 'pathfinder',
  NEGOTIATION_BASED = 'negotiation_based',
  GRIDGRAPH = 'gridgraph',
}

export enum FloorplanningAlgorithm {
  SLICING_TREE = 'slicing_tree',
  SEQUENCE_PAIR = 'sequence_pair',
  B_STAR_TREE = 'b_star_tree',
  CORNER_BLOCK_LIST = 'corner_block_list',
  O_TREE = 'o_tree',
  TCG = 'tcg', // Transitive Closure Graph
  FIXED_OUTLINE = 'fixed_outline',
}

export enum SynthesisAlgorithm {
  LOGIC_OPTIMIZATION = 'logic_optimization',
  TECHNOLOGY_MAPPING = 'technology_mapping',
  RETIMING = 'retiming',
  BOOLEAN_MINIMIZATION = 'boolean_minimization',
  TWO_LEVEL_MINIMIZATION = 'two_level_minimization',
  ABC = 'abc', // Berkeley ABC
  ESPRESSO = 'espresso',
  SIS = 'sis',
  AIG = 'aig', // And-Inverter Graph
  SAT_BASED = 'sat_based',
}

export enum TimingAlgorithm {
  STATIC_TIMING_ANALYSIS = 'static_timing_analysis',
  CRITICAL_PATH = 'critical_path',
  SETUP_HOLD_CHECK = 'setup_hold_check',
  CLOCK_DOMAIN_CROSSING = 'clock_domain_crossing',
}

export enum PowerAlgorithm {
  CLOCK_GATING = 'clock_gating',
  VOLTAGE_SCALING = 'voltage_scaling',
  POWER_GATING = 'power_gating',
  MULTI_VDD = 'multi_vdd',
  LEAKAGE_REDUCTION = 'leakage_reduction',
}

export enum ClockTreeAlgorithm {
  H_TREE = 'h_tree',
  X_TREE = 'x_tree',
  MESH_CLOCK = 'mesh_clock',
  MMM_ALGORITHM = 'mmm_algorithm',
}

export enum PartitioningAlgorithm {
  KERNIGHAN_LIN = 'kernighan_lin',
  FIDUCCIA_MATTHEYSES = 'fiduccia_mattheyses',
  MULTILEVEL = 'multilevel',
  SPECTRAL = 'spectral',
  RATIO_CUT = 'ratio_cut',
  NORMALIZED_CUT = 'normalized_cut',
  TABU_SEARCH = 'tabu_search',
}

export enum DRCLVSAlgorithm {
  DESIGN_RULE_CHECK = 'design_rule_check',
  LAYOUT_VS_SCHEMATIC = 'layout_vs_schematic',
  ELECTRICAL_RULE_CHECK = 'electrical_rule_check',
}

export enum RLAlgorithm {
  DQN_FLOORPLANNING = 'dqn_floorplanning',
  POLICY_GRADIENT_PLACEMENT = 'policy_gradient_placement',
  ACTOR_CRITIC_ROUTING = 'actor_critic_routing',
  Q_LEARNING_PLACEMENT = 'q_learning_placement',
  PPO_FLOORPLANNING = 'ppo_floorplanning',
}

export enum LegalizationAlgorithm {
  TETRIS = 'tetris',
  ABACUS = 'abacus',
  FLOW_BASED = 'flow_based',
  MIN_COST_FLOW = 'min_cost_flow',
}

export enum BufferInsertionAlgorithm {
  VAN_GINNEKEN = 'van_ginneken',
  BUFFER_TREE = 'buffer_tree',
  TIMING_DRIVEN = 'timing_driven',
}

export enum CongestionEstimationAlgorithm {
  RUDY = 'rudy',
  PROBABILISTIC = 'probabilistic',
  GRID_BASED = 'grid_based',
}

export enum SignalIntegrityAlgorithm {
  CROSSTALK_ANALYSIS = 'crosstalk_analysis',
  NOISE_ANALYSIS = 'noise_analysis',
  COUPLING_CAPACITANCE = 'coupling_capacitance',
}

export enum IRDropAlgorithm {
  POWER_GRID_ANALYSIS = 'power_grid_analysis',
  VOLTAGE_DROP = 'voltage_drop',
  DECAP_PLACEMENT = 'decap_placement',
}

export enum LithographyAlgorithm {
  OPC = 'opc', // Optical Proximity Correction
  PHASE_SHIFT_MASKING = 'phase_shift_masking',
  SRAF = 'sraf', // Sub-Resolution Assist Features
}

export enum CMPAlgorithm {
  DUMMY_FILL = 'dummy_fill',
  CMP_AWARE_ROUTING = 'cmp_aware_routing',
  DENSITY_BALANCING = 'density_balancing',
}

// Base interfaces
export interface Point {
  x: number;
  y: number;
}

export interface Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Cell {
  id: string;
  name: string;
  width: number;
  height: number;
  position?: Point;
  pins: Pin[];
  type: 'standard' | 'macro' | 'io';
}

export interface Pin {
  id: string;
  name: string;
  position: Point;
  direction: 'input' | 'output' | 'inout';
}

export interface Net {
  id: string;
  name: string;
  pins: string[]; // Pin IDs
  weight: number;
}

export interface Wire {
  id: string;
  netId: string;
  points: Point[];
  layer: number;
  width: number;
}

// Algorithm parameters
export interface PlacementParams {
  algorithm: PlacementAlgorithm;
  chipWidth: number;
  chipHeight: number;
  cells: Cell[];
  nets: Net[];
  iterations?: number;
  temperature?: number; // for simulated annealing
  populationSize?: number; // for genetic
  mutationRate?: number; // for genetic
  coolingRate?: number; // for simulated annealing
}

export interface RoutingParams {
  algorithm: RoutingAlgorithm;
  chipWidth: number;
  chipHeight: number;
  cells: Cell[];
  nets: Net[];
  layers: number;
  gridSize?: number;
  viaWeight?: number;
  bendWeight?: number;
}

export interface FloorplanningParams {
  algorithm: FloorplanningAlgorithm;
  chipWidth: number;
  chipHeight: number;
  blocks: Cell[];
  aspectRatioMin?: number;
  aspectRatioMax?: number;
  utilizationTarget?: number;
}

export interface SynthesisParams {
  algorithm: SynthesisAlgorithm;
  netlist: string; // Verilog/VHDL code
  targetLibrary: string;
  optimizationLevel: 'area' | 'power' | 'timing';
  clockPeriod?: number;
}

export interface TimingParams {
  algorithm: TimingAlgorithm;
  netlist: string;
  clockPeriod: number;
  cells: Cell[];
  wires: Wire[];
  sdfFile?: string; // Standard Delay Format
}

export interface PowerParams {
  algorithm: PowerAlgorithm;
  netlist: string;
  cells: Cell[];
  clockFrequency: number;
  voltage: number;
  temperature: number;
}

export interface ClockTreeParams {
  algorithm: ClockTreeAlgorithm;
  clockSource: Point;
  sinks: Point[];
  chipWidth: number;
  chipHeight: number;
  meshDensity?: number;
  maxSkew?: number;
}

export interface PartitioningParams {
  algorithm: PartitioningAlgorithm;
  cells: Cell[];
  nets: Net[];
  partitionCount: number;
  maxIterations?: number;
  balanceTolerance?: number;
}

export interface DRCLVSParams {
  algorithm: DRCLVSAlgorithm;
  cells: Cell[];
  wires: Wire[];
  netlist?: string;
  designRules?: any[];
}

// Algorithm results
export interface PlacementResult {
  success: boolean;
  cells: Cell[];
  totalWirelength: number;
  overlap: number;
  runtime: number;
  iterations: number;
  convergenceData?: number[];
}

export interface RoutingResult {
  success: boolean;
  wires: Wire[];
  totalWirelength: number;
  viaCount: number;
  congestion: number;
  runtime: number;
  unroutedNets: string[];
}

export interface FloorplanningResult {
  success: boolean;
  blocks: Cell[];
  area: number;
  aspectRatio: number;
  utilization: number;
  deadSpace: number;
  runtime: number;
}

export interface SynthesisResult {
  success: boolean;
  optimizedNetlist: string;
  gateCount: number;
  area: number;
  power: number;
  criticalPathDelay: number;
  runtime: number;
}

export interface TimingResult {
  success: boolean;
  criticalPath: string[];
  slackTime: number;
  setupViolations: number;
  holdViolations: number;
  maxDelay: number;
  minDelay: number;
  clockSkew: number;
  runtime: number;
}

export interface PowerResult {
  success: boolean;
  staticPower: number;
  dynamicPower: number;
  totalPower: number;
  leakagePower: number;
  switchingPower: number;
  clockPower: number;
  reduction: number; // percentage reduction
  runtime: number;
}

export interface ClockTreeResult {
  success: boolean;
  root: any; // ClockNode (defined in implementation)
  wires: Wire[];
  totalWirelength: number;
  skew: number;
  maxDelay: number;
  bufferCount: number;
  powerConsumption: number;
  runtime: number;
}

export interface PartitioningResult {
  success: boolean;
  partitions: string[][]; // Arrays of cell IDs for each partition
  cutsize: number;
  balanceRatio: number;
  iterations: number;
  runtime: number;
}

export interface DRCLVSResult {
  success: boolean;
  violations: any[];
  errorCount: number;
  warningCount: number;
  checkedObjects: number;
  runtime: number;
}

// Legalization types
export interface LegalizationParams {
  algorithm: LegalizationAlgorithm;
  cells: Cell[];
  chipWidth: number;
  chipHeight: number;
  rowHeight: number;
  siteWidth: number;
}

export interface LegalizationResult {
  success: boolean;
  cells: Cell[];
  totalDisplacement: number;
  maxDisplacement: number;
  overlap: number;
  runtime: number;
}

// Buffer Insertion types
export interface BufferInsertionParams {
  algorithm: BufferInsertionAlgorithm;
  net: Net;
  cells: Cell[];
  bufferTypes: any[];
  maxCapacitance: number;
  targetSlew: number;
}

export interface BufferInsertionResult {
  success: boolean;
  buffers: Cell[];
  totalDelay: number;
  powerCost: number;
  bufferCount: number;
  runtime: number;
}

// Congestion Estimation types
export interface CongestionEstimationParams {
  algorithm: CongestionEstimationAlgorithm;
  cells: Cell[];
  nets: Net[];
  chipWidth: number;
  chipHeight: number;
  gridSize: number;
}

export interface CongestionEstimationResult {
  success: boolean;
  congestionMap: number[][];
  maxCongestion: number;
  avgCongestion: number;
  hotspots: Point[];
  runtime: number;
}

// Signal Integrity types
export interface SignalIntegrityParams {
  algorithm: SignalIntegrityAlgorithm;
  nets: Net[];
  wires: Wire[];
  frequency: number;
  technology: number; // nm
}

export interface SignalIntegrityResult {
  success: boolean;
  violations: any[];
  crosstalkPairs: any[];
  noiseMargin: number;
  affectedNets: string[];
  runtime: number;
}

// IR Drop types
export interface IRDropParams {
  algorithm: IRDropAlgorithm;
  powerGrid: any;
  cells: Cell[];
  current: number;
  voltage: number;
}

export interface IRDropResult {
  success: boolean;
  voltageMap: number[][];
  maxDrop: number;
  avgDrop: number;
  violations: Point[];
  decapCount?: number;
  runtime: number;
}

// Lithography types
export interface LithographyParams {
  algorithm: LithographyAlgorithm;
  layout: any;
  wavelength: number;
  technology: number; // nm
}

export interface LithographyResult {
  success: boolean;
  correctedLayout: any;
  corrections: number;
  printability: number;
  runtime: number;
}

// CMP types
export interface CMPParams {
  algorithm: CMPAlgorithm;
  layout: any;
  densityTarget: number;
  windowSize: number;
}

export interface CMPResult {
  success: boolean;
  modifiedLayout: any;
  fillCount: number;
  densityVariation: number;
  uniformity: number;
  runtime: number;
}

// Reinforcement Learning types
export interface RLState {
  observation: number[];
  gridState?: number[][];
  blockPositions?: Rectangle[];
  availableActions: number[];
}

export interface RLAction {
  type: 'place' | 'route' | 'move' | 'rotate';
  blockId?: string;
  position?: Point;
  direction?: number;
  wireSegment?: Point[];
}

export interface RLReward {
  wirelength: number;
  overlap: number;
  timing: number;
  power: number;
  total: number;
}

export interface RLExperience {
  state: RLState;
  action: RLAction;
  reward: number;
  nextState: RLState;
  done: boolean;
}

export interface RLParams {
  algorithm: RLAlgorithm;
  cells: Cell[];
  nets: Net[];
  chipWidth: number;
  chipHeight: number;
  episodes?: number;
  learningRate?: number;
  discountFactor?: number;
  epsilon?: number;
  batchSize?: number;
  usePretrained?: boolean;
}

export interface RLResult {
  success: boolean;
  cells: Cell[];
  totalReward: number;
  episodeRewards: number[];
  wirelength: number;
  overlap: number;
  convergence: number[];
  trainingTime: number;
  inferenceTime: number;
  steps: number;
}

// Unified algorithm request/response
export interface AlgorithmRequest {
  category: AlgorithmCategory;
  algorithm: string;
  parameters: PlacementParams | RoutingParams | FloorplanningParams | SynthesisParams | TimingParams | PowerParams;
}

export interface AlgorithmResponse {
  success: boolean;
  category: AlgorithmCategory;
  algorithm: string;
  result: PlacementResult | RoutingResult | FloorplanningResult | SynthesisResult | TimingResult | PowerResult;
  metadata: {
    timestamp: string;
    version: string;
    runtime: number;
  };
}

// Visualization data
export interface VisualizationData {
  type: 'placement' | 'routing' | 'floorplan' | 'timing' | 'power';
  chipDimensions: { width: number; height: number };
  cells?: Cell[];
  wires?: Wire[];
  heatmap?: number[][];
  timingPaths?: { path: string[]; delay: number }[];
  powerDistribution?: { cell: string; power: number }[];
}
