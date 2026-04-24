/**
 * Default parameter builders for each algorithm category.
 *
 * Two layers:
 *
 *  1. Category baseline → a sane request body for the API for that category
 *     (chip size, cells/nets, fundamental knobs every algorithm in the
 *     category accepts).
 *
 *  2. Per-algorithm overrides → the knobs each individual algorithm cares
 *     about, set to values that give that algorithm a fair shot at doing
 *     well. Without this, every placement algorithm gets the same
 *     `iterations: 30` and SA/genetic/force-directed are unfairly judged
 *     on identical input.
 */

function makeDesign(n: number) {
  const cells: any[] = [];
  for (let i = 0; i < n; i++) {
    cells.push({
      id: `c${i}`, name: `c${i}`, width: 20, height: 20,
      position: { x: (i % 10) * 30, y: Math.floor(i / 10) * 30 },
      pins: [
        { id: `c${i}_in`,  name: 'A', position: { x: 0,  y: 10 }, direction: 'input'  },
        { id: `c${i}_out`, name: 'Y', position: { x: 20, y: 10 }, direction: 'output' },
      ],
      type: 'standard',
    });
  }
  const nets: any[] = [];
  for (let i = 0; i < n - 1; i++) {
    nets.push({
      id: `n${i}`, name: `n${i}`, pins: [`c${i}_out`, `c${i + 1}_in`], weight: 1,
    });
  }
  return { cells, nets };
}

/**
 * Per-algorithm tuning. Maps algorithm name → params object that gets merged
 * on top of the category baseline. Anything not listed here just uses the
 * category defaults.
 */
const PER_ALGORITHM: Record<string, Record<string, any>> = {
  // -------- placement --------
  // Annealing thrives on long schedules, slow cooling.
  simulated_annealing: { iterations: 200, temperature: 1000, coolingRate: 0.97 },
  // Genetic needs a population to actually breed.
  genetic:             { iterations: 80,  populationSize: 60, mutationRate: 0.05 },
  // Spring-based: needs many tiny steps to relax.
  force_directed:      { iterations: 500 },
  // Quadratic / analytical converge fast — fewer iters is fine.
  quadratic:           { iterations: 50 },
  analytical:          { iterations: 50 },

  // -------- routing --------
  // Maze: small grid → finer routing, more chances of finding a short path.
  maze_routing:    { gridSize: 10, bendWeight: 2, viaWeight: 4 },
  // Global routing: coarser grid is fine, focus on spreading load.
  global_routing:  { gridSize: 50, bendWeight: 1, viaWeight: 2 },
  // A*: medium grid, mild bend penalty.
  a_star:          { gridSize: 20, bendWeight: 1, viaWeight: 2 },
  // Classical channel routing: track pitch via gridSize.
  left_edge:       { gridSize: 8 },
  channel_routing: { gridSize: 8 },
  // Van Ginneken buffer insertion — controls wire-length threshold for buffering.
  van_ginneken:    { gridSize: 20 },
  buffer_tree:     { gridSize: 20 },
  timing_driven:   { gridSize: 15, bendWeight: 3 },

  // -------- floorplanning --------
  slicing_tree:      { iterations: 200 },
  sequence_pair:     { iterations: 300, swapProbability: 0.3 },
  o_tree:            { iterations: 200 },
  corner_block_list: { iterations: 200 },
  tcg:               { iterations: 300 },
  fixed_outline:     { iterations: 300, aspectRatioMin: 0.8, aspectRatioMax: 1.25 },

  // -------- synthesis --------
  logic_optimization:   { optimizationLevel: 'area',   passes: 3 },
  technology_mapping:   { optimizationLevel: 'timing', passes: 2 },

  // -------- timing analysis --------
  // Tighter clock surfaces violations; STA needs cells+wires only.
  static_timing_analysis: { clockPeriod: 5 },
  critical_path:          { clockPeriod: 5 },

  // -------- power optimization --------
  clock_gating:    { clockFrequency: 1e9, voltage: 1.0, temperature: 25, activityFactor: 0.2 },
  voltage_scaling: { clockFrequency: 1e9, voltage: 0.9, temperature: 25 },
  power_gating:    { clockFrequency: 1e9, voltage: 1.0, temperature: 25, idleFraction: 0.4 },
  // Distinct knobs so each algorithm is exercised with its own parameter.
  multi_vdd:             { clockFrequency: 1e9, voltage: 1.0, temperature: 25, highVddRatio: 0.3, lowVdd: 0.75 },
  leakage_reduction:     { clockFrequency: 1e9, voltage: 1.0, temperature: 25, hvtRatio: 0.8 },
  power_grid_analysis:   { clockFrequency: 1e9, voltage: 1.0, temperature: 25, gridResistance: 0.05 },
  voltage_drop:          { clockFrequency: 1e9, voltage: 1.0, temperature: 25, gridResistance: 0.05 },
  decap_placement:       { clockFrequency: 1e9, voltage: 1.0, temperature: 25, decapRatio: 0.1 },

  // -------- clock tree --------
  h_tree:        { meshDensity: 4,  maxSkew: 0.1 },
  x_tree:        { meshDensity: 4,  maxSkew: 0.1 },
  mesh_clock:    { meshDensity: 12, maxSkew: 0.05 },
  mmm_algorithm: { meshDensity: 6,  maxSkew: 0.1 },

  // -------- partitioning --------
  // KL needs many sweeps to converge.
  kernighan_lin:       { maxIterations: 100, balanceTolerance: 0.1 },
  // FM is faster per pass — give it more passes.
  fiduccia_mattheyses: { maxIterations: 200, balanceTolerance: 0.1 },
  // Multilevel coarsens fast; few outer iterations is right.
  multilevel:          { maxIterations: 10,  balanceTolerance: 0.1 },

  // -------- drc / lvs --------
  design_rule_check:     { strict: true },
  layout_vs_schematic:   { strict: true },
  electrical_rule_check: { strict: true },

  // -------- thermal / dft --------
  hotspot_detection:   { tilePitch: 40, hotspotThreshold: 0.004 },
  thermal_rc:          { tilePitch: 50, rAmbient: 10, rLateral: 1 },
  scan_chain_insertion:{ maxChainLength: 0 },
  atpg_basic:          { patternCount: 128, seed: 1 },

  // -------- signal integrity / lithography / cmp / ir_drop --------
  // These all accept a `strict` flag and benefit from more wires to scan.
  crosstalk_analysis:   { strict: true },
  coupling_capacitance: { strict: true },
  noise_analysis:       { strict: true },
  ir_drop:              { strict: true },
  opc:                  { strict: true },
  phase_shift_masking:  { strict: true },
  sraf:                 { strict: true },
  dummy_fill:           { strict: true },
  density_balancing:    { strict: true },
  cmp_aware_routing:    { strict: true },

  // -------- reinforcement learning --------
  // RL needs *real* training to be fair. 10 episodes is a stub-killer.
  dqn_floorplanning:         { episodes: 200, learningRate: 1e-3, discountFactor: 0.95, epsilon: 0.1, batchSize: 32 },
  ppo_floorplanning:         { episodes: 200, learningRate: 3e-4, discountFactor: 0.99, epsilon: 0.2 },
  q_learning_placement:      { episodes: 300, learningRate: 0.1,  discountFactor: 0.9,  epsilon: 0.1 },
  policy_gradient_placement: { episodes: 200, learningRate: 1e-3, discountFactor: 0.95 },
  actor_critic_routing:      { episodes: 200, learningRate: 5e-4, discountFactor: 0.95 },
};

export function defaultParams(category: string, algorithm: string, size = 20): any {
  const { cells, nets } = makeDesign(size);
  const chip = { chipWidth: 1000, chipHeight: 1000 };

  let base: any;
  switch (category) {
    case 'placement':
      base = { algorithm, ...chip, cells, nets, iterations: 30 };
      break;

    case 'routing':
      base = {
        algorithm, ...chip, cells, nets,
        layers: 4, gridSize: 20, viaWeight: 2, bendWeight: 1,
      };
      break;

    case 'floorplanning':
      base = {
        algorithm, ...chip,
        blocks: cells.map(c => ({ ...c, type: 'macro' as const })),
        aspectRatioMin: 0.5, aspectRatioMax: 2.0, utilizationTarget: 0.7,
      };
      break;

    case 'synthesis':
      base = {
        algorithm,
        netlist: 'module top(input a, b, output y); assign y = a & b; endmodule',
        targetLibrary: 'sky130', optimizationLevel: 'area', clockPeriod: 10,
      };
      break;

    case 'timing_analysis':
      base = {
        algorithm,
        netlist: 'top', clockPeriod: 5, cells, wires: [],
      };
      break;

    case 'power_optimization':
      base = {
        algorithm,
        netlist: 'top', cells,
        clockFrequency: 1e9, voltage: 1.0, temperature: 25,
      };
      break;

    case 'clock_tree':
      base = {
        algorithm,
        clockSource: { x: 500, y: 500 },
        sinks: cells.map(c => ({
          x: (c.position?.x ?? 0) + 10, y: (c.position?.y ?? 0) + 10,
        })),
        ...chip, meshDensity: 8, maxSkew: 0.1,
      };
      break;

    case 'partitioning':
      base = {
        algorithm, cells, nets,
        partitionCount: 2, maxIterations: 20, balanceTolerance: 0.1,
      };
      break;

    case 'drc_lvs':
      base = { algorithm, cells, wires: [] };
      break;

    case 'reinforcement_learning':
      base = {
        algorithm, ...chip, cells, nets,
        episodes: 10, learningRate: 0.01, discountFactor: 0.9, epsilon: 0.1,
      };
      break;

    // --- Newly exposed categories ------------------------------------------

    case 'signal_integrity':
    case 'ir_drop':
    case 'lithography':
    case 'cmp': {
      // DRCLVSParams shape — these analyses inspect cells + wires for
      // violations. Synthesize a few short wires so there's actually
      // something to check rather than an empty canvas.
      const wires: any[] = [];
      for (let i = 0; i < Math.min(nets.length, size - 1); i++) {
        const ax = (i % 10) * 30 + 10;
        const ay = Math.floor(i / 10) * 30 + 10;
        const bx = ((i + 1) % 10) * 30 + 10;
        const by = Math.floor((i + 1) / 10) * 30 + 10;
        wires.push({
          id: `w${i}`,
          net: `n${i}`,
          layer: (i % 4) + 1,
          points: [{ x: ax, y: ay }, { x: bx, y: by }],
        });
      }
      base = { algorithm, ...chip, cells, wires };
      break;
    }

    case 'thermal':
      base = {
        algorithm, cells, ...chip,
        tilePitch: 50,
        defaultPowerDensity: 0.001,
        hotspotThreshold: 0.005,
        rAmbient: 10,
        rLateral: 1,
      };
      break;

    case 'dft':
      // scan_chain_insertion wants FFs; our generic cells won't match the
      // FF heuristic (needs DFF/FF/REG in name), but the analysis still runs
      // and simply reports 0 flip-flops found. atpg_basic runs on any cells.
      base = { algorithm, cells, patternCount: 64, seed: 1 };
      break;

    case 'multi_objective': {
      // Build a trivial 3-candidate set with 2 objectives (wirelength, area).
      // Lower-is-better for both — realistic shape for a Pareto demo.
      const candidates = [
        { id: 'A', objectives: { wirelength: 100, area: 2000 } },
        { id: 'B', objectives: { wirelength: 150, area: 1500 } },
        { id: 'C', objectives: { wirelength: 120, area: 1800 } },
      ];
      if (algorithm === 'weighted_best') {
        base = {
          algorithm,
          candidates,
          weights: { wirelength: 0.6, area: 0.4 },
          reference: { wirelength: 200, area: 2500 },
        };
      } else {
        // pareto_frontier
        base = {
          algorithm,
          candidates,
          reference: { wirelength: 200, area: 2500 },
        };
      }
      break;
    }

    case 'eco': {
      // Minimal snapshot + one no-op operation matching the algorithm name.
      const now = new Date().toISOString();
      const snapshot = {
        schemaVersion: 1,
        id: 'compare-eco',
        name: 'compare-eco',
        createdAt: now,
        updatedAt: now,
        dieArea: { width: 1000, height: 1000 },
        cells, nets, wires: [],
      };
      let operation: any;
      switch (algorithm) {
        case 'cell_move':
          operation = { kind: 'cell_move', cellId: 'c0', newPosition: { x: 50, y: 50 } };
          break;
        case 'cell_swap':
          operation = { kind: 'cell_swap', cellId: 'c0', newName: 'c0_swapped' };
          break;
        case 'gate_resize':
          operation = { kind: 'gate_resize', cellId: 'c0', scaleFactor: 2 };
          break;
        case 'pin_swap':
          operation = { kind: 'pin_swap', cellId: 'c0', pinA: 'c0_in', pinB: 'c0_out' };
          break;
        case 'buffer_insert':
          operation = {
            kind: 'buffer_insert',
            netId: 'n0',
            buffer: {
              id: 'buf0', name: 'BUF', width: 10, height: 20,
              position: { x: 15, y: 15 },
              pins: [
                { id: 'buf0_A', name: 'A', position: { x: 0,  y: 10 }, direction: 'input'  },
                { id: 'buf0_Y', name: 'Y', position: { x: 10, y: 10 }, direction: 'output' },
              ],
              type: 'standard',
            },
            bufferInputPinId: 'buf0_A',
            bufferOutputPinId: 'buf0_Y',
          };
          break;
        default:
          operation = { kind: 'cell_move', cellId: 'c0', newPosition: { x: 50, y: 50 } };
      }
      base = { algorithm, snapshot, operations: [operation], atomic: true };
      break;
    }

    // Approximation categories that the API dispatches through other runners.
    case 'legalization':
      base = { algorithm, ...chip, cells, nets, iterations: 30 };
      break;

    case 'buffer_insertion':
    case 'congestion_estimation':
      base = {
        algorithm, ...chip, cells, nets,
        layers: 4, gridSize: 20, viaWeight: 2, bendWeight: 1,
      };
      break;

    default:
      base = { algorithm, ...chip, cells, nets };
  }

  // Merge per-algorithm tuning on top so each algorithm runs with the knobs
  // it actually deserves.
  const tuning = PER_ALGORITHM[algorithm];
  return tuning ? { ...base, ...tuning } : base;
}
