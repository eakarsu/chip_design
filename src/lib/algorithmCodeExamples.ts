import { AlgorithmCategory } from '@/types/algorithms';

export interface CodeExample {
  language: 'typescript' | 'python' | 'curl';
  code: string;
}

export interface AlgorithmCodeExample {
  algorithm: string;
  description: string;
  examples: CodeExample[];
}

export const algorithmCodeExamples: Record<AlgorithmCategory, Record<string, AlgorithmCodeExample>> = {
  [AlgorithmCategory.PLACEMENT]: {
    simulated_annealing: {
      algorithm: 'Simulated Annealing',
      description: 'Probabilistic optimization using temperature cooling for cell placement',
      examples: [
        {
          language: 'typescript',
          code: `import { NeuralChip } from '@neuralchip/sdk';

const chip = new NeuralChip({ apiKey: process.env.NEURALCHIP_API_KEY });

const result = await chip.placement.run({
  algorithm: 'simulated_annealing',
  chipWidth: 1000,
  chipHeight: 1000,
  cells: [
    { id: 'cell1', width: 50, height: 50 },
    { id: 'cell2', width: 60, height: 60 },
  ],
  nets: [
    { id: 'net1', cellIds: ['cell1', 'cell2'] },
  ],
  iterations: 1000,
});

console.log('Wirelength:', result.wirelength);
console.log('Runtime:', result.runtime, 'ms');`,
        },
        {
          language: 'python',
          code: `from neuralchip import NeuralChip

chip = NeuralChip(api_key=os.environ['NEURALCHIP_API_KEY'])

result = chip.placement.run(
    algorithm='simulated_annealing',
    chip_width=1000,
    chip_height=1000,
    cells=[
        {'id': 'cell1', 'width': 50, 'height': 50},
        {'id': 'cell2', 'width': 60, 'height': 60},
    ],
    nets=[
        {'id': 'net1', 'cell_ids': ['cell1', 'cell2']},
    ],
    iterations=1000
)

print(f"Wirelength: {result['wirelength']}")
print(f"Runtime: {result['runtime']} ms")`,
        },
        {
          language: 'curl',
          code: `curl -X POST https://api.neuralchip.com/v1/algorithms \\
  -H "Authorization: Bearer $NEURALCHIP_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "category": "placement",
    "algorithm": "simulated_annealing",
    "parameters": {
      "chipWidth": 1000,
      "chipHeight": 1000,
      "cells": [
        {"id": "cell1", "width": 50, "height": 50}
      ],
      "nets": [
        {"id": "net1", "cellIds": ["cell1", "cell2"]}
      ],
      "iterations": 1000
    }
  }'`,
        },
      ],
    },
    genetic: {
      algorithm: 'Genetic Algorithm',
      description: 'Evolution-based approach with crossover and mutation',
      examples: [
        {
          language: 'typescript',
          code: `const result = await chip.placement.run({
  algorithm: 'genetic',
  chipWidth: 1000,
  chipHeight: 1000,
  cells: cells,
  nets: nets,
  populationSize: 100,
  generations: 500,
  mutationRate: 0.1,
  crossoverRate: 0.7,
});`,
        },
      ],
    },
    force_directed: {
      algorithm: 'Force-Directed',
      description: 'Physical simulation with attractive/repulsive forces',
      examples: [
        {
          language: 'typescript',
          code: `const result = await chip.placement.run({
  algorithm: 'force_directed',
  chipWidth: 1000,
  chipHeight: 1000,
  cells: cells,
  nets: nets,
  iterations: 500,
  springConstant: 0.1,
  repulsionConstant: 100,
});`,
        },
      ],
    },
    analytical: {
      algorithm: 'Analytical Placement (RePlAce/DREAMPlace)',
      description: 'Quadratic wirelength optimization with spreading',
      examples: [
        {
          language: 'typescript',
          code: `const result = await chip.placement.run({
  algorithm: 'analytical',
  chipWidth: 1000,
  chipHeight: 1000,
  cells: cells,
  nets: nets,
  maxIterations: 100,
  targetDensity: 0.8,
});`,
        },
      ],
    },
  },
  [AlgorithmCategory.ROUTING]: {
    maze_routing: {
      algorithm: 'Maze Routing (Lee)',
      description: "Lee's BFS-based algorithm guarantees shortest path",
      examples: [
        {
          language: 'typescript',
          code: `const result = await chip.routing.run({
  algorithm: 'maze_routing',
  chipWidth: 1000,
  chipHeight: 1000,
  nets: nets,
  gridSize: 10,
  layers: 3,
});`,
        },
      ],
    },
    a_star: {
      algorithm: 'A* Routing',
      description: 'Heuristic search for faster routing',
      examples: [
        {
          language: 'typescript',
          code: `const result = await chip.routing.run({
  algorithm: 'a_star',
  chipWidth: 1000,
  chipHeight: 1000,
  nets: nets,
  gridSize: 10,
  heuristic: 'manhattan',
});`,
        },
      ],
    },
    global_routing: {
      algorithm: 'Global Routing',
      description: 'Coarse routing for planning',
      examples: [
        {
          language: 'typescript',
          code: `const result = await chip.routing.run({
  algorithm: 'global_routing',
  chipWidth: 1000,
  chipHeight: 1000,
  nets: nets,
  gridSize: 50,
});`,
        },
      ],
    },
  },
  [AlgorithmCategory.FLOORPLANNING]: {
    slicing_tree: {
      algorithm: 'Slicing Tree',
      description: 'Recursive binary partitioning',
      examples: [
        {
          language: 'typescript',
          code: `const result = await chip.floorplanning.run({
  algorithm: 'slicing_tree',
  blocks: blocks,
  chipWidth: 1000,
  chipHeight: 1000,
  aspectRatioMin: 0.5,
  aspectRatioMax: 2.0,
});`,
        },
      ],
    },
    sequence_pair: {
      algorithm: 'Sequence Pair',
      description: 'Constraint-based representation',
      examples: [
        {
          language: 'typescript',
          code: `const result = await chip.floorplanning.run({
  algorithm: 'sequence_pair',
  blocks: blocks,
  chipWidth: 1000,
  chipHeight: 1000,
  iterations: 1000,
});`,
        },
      ],
    },
    b_star_tree: {
      algorithm: 'B*-Tree',
      description: 'Binary tree representation for non-slicing floorplans',
      examples: [
        {
          language: 'typescript',
          code: `const result = await chip.floorplanning.run({
  algorithm: 'b_star_tree',
  blocks: blocks,
  chipWidth: 1000,
  chipHeight: 1000,
  iterations: 1000,
});`,
        },
      ],
    },
  },
  [AlgorithmCategory.SYNTHESIS]: {
    logic_optimization: {
      algorithm: 'Logic Optimization',
      description: 'Boolean minimization and restructuring',
      examples: [
        {
          language: 'typescript',
          code: `const result = await chip.synthesis.run({
  algorithm: 'logic_optimization',
  netlist: verilogCode,
  optimizationLevel: 'area',
  clockPeriod: 10,
});`,
        },
      ],
    },
    technology_mapping: {
      algorithm: 'Technology Mapping',
      description: 'Map to target cell library',
      examples: [
        {
          language: 'typescript',
          code: `const result = await chip.synthesis.run({
  algorithm: 'technology_mapping',
  netlist: verilogCode,
  library: 'standard_cells_7nm',
  optimizationGoal: 'timing',
});`,
        },
      ],
    },
  },
  [AlgorithmCategory.TIMING_ANALYSIS]: {
    static_timing_analysis: {
      algorithm: 'Static Timing Analysis',
      description: 'Comprehensive path delay analysis',
      examples: [
        {
          language: 'typescript',
          code: `const result = await chip.timing.run({
  algorithm: 'static_timing_analysis',
  netlist: verilogCode,
  clockPeriod: 10,
  cells: placedCells,
  wires: routedWires,
});

console.log('Critical path:', result.criticalPath);
console.log('Slack time:', result.slackTime);
console.log('Setup violations:', result.setupViolations);`,
        },
      ],
    },
    critical_path: {
      algorithm: 'Critical Path Analysis',
      description: 'Find longest delay path',
      examples: [
        {
          language: 'typescript',
          code: `const result = await chip.timing.run({
  algorithm: 'critical_path',
  netlist: verilogCode,
  clockPeriod: 10,
  cells: placedCells,
});`,
        },
      ],
    },
  },
  [AlgorithmCategory.POWER_OPTIMIZATION]: {
    clock_gating: {
      algorithm: 'Clock Gating',
      description: 'Disable clocks to idle circuits',
      examples: [
        {
          language: 'typescript',
          code: `const result = await chip.power.run({
  algorithm: 'clock_gating',
  netlist: verilogCode,
  cells: cells,
  clockFrequency: 1000,
  voltage: 1.2,
  temperature: 85,
});

console.log('Power saved:', result.powerSaved, 'mW');`,
        },
      ],
    },
    voltage_scaling: {
      algorithm: 'Voltage Scaling (DVFS)',
      description: 'Reduce voltage/frequency dynamically',
      examples: [
        {
          language: 'typescript',
          code: `const result = await chip.power.run({
  algorithm: 'voltage_scaling',
  netlist: verilogCode,
  cells: cells,
  voltageRange: [0.8, 1.2],
  frequencyRange: [500, 1000],
});`,
        },
      ],
    },
  },
  [AlgorithmCategory.CLOCK_TREE]: {
    h_tree: {
      algorithm: 'H-Tree',
      description: 'Symmetric H-shaped tree structure for zero-skew',
      examples: [
        {
          language: 'typescript',
          code: `const result = await chip.clockTree.run({
  algorithm: 'h_tree',
  clockSource: { x: 500, y: 500 },
  sinks: clockSinks,
  chipWidth: 1000,
  chipHeight: 1000,
  maxSkew: 0.1,
});

console.log('Clock skew:', result.clockSkew, 'ns');`,
        },
      ],
    },
    mesh_clock: {
      algorithm: 'Mesh Clock',
      description: 'Grid/mesh structure for robust distribution',
      examples: [
        {
          language: 'typescript',
          code: `const result = await chip.clockTree.run({
  algorithm: 'mesh_clock',
  clockSource: { x: 500, y: 500 },
  sinks: clockSinks,
  chipWidth: 1000,
  chipHeight: 1000,
  meshDensity: 4,
});`,
        },
      ],
    },
  },
  [AlgorithmCategory.PARTITIONING]: {
    kernighan_lin: {
      algorithm: 'Kernighan-Lin',
      description: 'Classic iterative improvement for graph bisection',
      examples: [
        {
          language: 'typescript',
          code: `const result = await chip.partitioning.run({
  algorithm: 'kernighan_lin',
  cells: cells,
  nets: nets,
  partitionCount: 2,
  maxIterations: 50,
});`,
        },
      ],
    },
    fiduccia_mattheyses: {
      algorithm: 'Fiduccia-Mattheyses',
      description: 'Linear-time refinement with gain buckets',
      examples: [
        {
          language: 'typescript',
          code: `const result = await chip.partitioning.run({
  algorithm: 'fiduccia_mattheyses',
  cells: cells,
  nets: nets,
  partitionCount: 2,
  balanceTolerance: 0.1,
});`,
        },
      ],
    },
  },
  [AlgorithmCategory.DRC_LVS]: {
    design_rule_check: {
      algorithm: 'Design Rule Check',
      description: 'Verify layout meets manufacturing constraints',
      examples: [
        {
          language: 'typescript',
          code: `const result = await chip.verification.run({
  algorithm: 'design_rule_check',
  cells: placedCells,
  wires: routedWires,
  designRules: [
    { name: 'MIN_WIDTH', minWidth: 0.1 },
    { name: 'MIN_SPACING', minSpacing: 0.15 },
  ],
});

console.log('Violations found:', result.violationCount);`,
        },
      ],
    },
    layout_vs_schematic: {
      algorithm: 'Layout vs Schematic',
      description: 'Verify physical layout matches logical netlist',
      examples: [
        {
          language: 'typescript',
          code: `const result = await chip.verification.run({
  algorithm: 'layout_vs_schematic',
  cells: placedCells,
  wires: routedWires,
  netlist: verilogCode,
});`,
        },
      ],
    },
  },
  [AlgorithmCategory.REINFORCEMENT_LEARNING]: {
    dqn_floorplanning: {
      algorithm: 'DQN Floorplanning',
      description: 'Deep Q-Network learns value functions for block placement',
      examples: [
        {
          language: 'typescript',
          code: `const result = await chip.rl.run({
  algorithm: 'dqn_floorplanning',
  cells: cells,
  nets: nets,
  chipWidth: 1000,
  chipHeight: 1000,
  episodes: 100,
  learningRate: 0.001,
  epsilon: 0.1,
  usePretrained: false,
});

console.log('Final reward:', result.finalReward);
console.log('Training time:', result.trainingTime, 'ms');`,
        },
      ],
    },
    q_learning_placement: {
      algorithm: 'Q-Learning Placement',
      description: 'Tabular Q-learning for cell placement',
      examples: [
        {
          language: 'typescript',
          code: `const result = await chip.rl.run({
  algorithm: 'q_learning_placement',
  cells: cells,
  nets: nets,
  chipWidth: 1000,
  chipHeight: 1000,
  episodes: 200,
  learningRate: 0.01,
  discountFactor: 0.99,
});`,
        },
      ],
    },
  },
  [AlgorithmCategory.LEGALIZATION]: {
    tetris: {
      algorithm: 'Tetris Legalization',
      description: 'Row-based legalization using Tetris-like packing',
      examples: [
        {
          language: 'typescript',
          code: `const result = await chip.legalization.run({
  algorithm: 'tetris',
  cells: overlappingCells,
  chipWidth: 1000,
  chipHeight: 1000,
  rowHeight: 10,
});`,
        },
      ],
    },
    abacus: {
      algorithm: 'Abacus Legalization',
      description: 'Cluster-based legalization',
      examples: [
        {
          language: 'typescript',
          code: `const result = await chip.legalization.run({
  algorithm: 'abacus',
  cells: overlappingCells,
  chipWidth: 1000,
  chipHeight: 1000,
});`,
        },
      ],
    },
  },
  [AlgorithmCategory.BUFFER_INSERTION]: {
    van_ginneken: {
      algorithm: 'Van Ginneken',
      description: 'Dynamic programming for optimal buffer insertion',
      examples: [
        {
          language: 'typescript',
          code: `const result = await chip.bufferInsertion.run({
  algorithm: 'van_ginneken',
  nets: criticalNets,
  bufferLibrary: bufferCells,
  maxDelay: 5.0,
});`,
        },
      ],
    },
  },
  [AlgorithmCategory.CONGESTION_ESTIMATION]: {
    rudy: {
      algorithm: 'RUDY',
      description: 'Rectangular Uniform wire DensitY estimation',
      examples: [
        {
          language: 'typescript',
          code: `const result = await chip.congestion.run({
  algorithm: 'rudy',
  cells: placedCells,
  nets: nets,
  chipWidth: 1000,
  chipHeight: 1000,
  gridSize: 50,
});

console.log('Congestion map:', result.congestionMap);`,
        },
      ],
    },
  },
  [AlgorithmCategory.SIGNAL_INTEGRITY]: {
    crosstalk_analysis: {
      algorithm: 'Crosstalk Analysis',
      description: 'Analyze signal coupling between adjacent wires',
      examples: [
        {
          language: 'typescript',
          code: `const result = await chip.signalIntegrity.run({
  algorithm: 'crosstalk_analysis',
  wires: routedWires,
  couplingThreshold: 0.1,
});

console.log('Crosstalk violations:', result.violations);`,
        },
      ],
    },
  },
  [AlgorithmCategory.IR_DROP]: {
    power_grid_analysis: {
      algorithm: 'Power Grid Analysis',
      description: 'Analyze voltage drop across power delivery network',
      examples: [
        {
          language: 'typescript',
          code: `const result = await chip.irDrop.run({
  algorithm: 'power_grid_analysis',
  powerGrid: gridStructure,
  currentSources: currentMap,
  targetVoltage: 1.2,
});

console.log('Max voltage drop:', result.maxVoltageDrop);`,
        },
      ],
    },
  },
  [AlgorithmCategory.LITHOGRAPHY]: {
    opc: {
      algorithm: 'OPC (Optical Proximity Correction)',
      description: 'Modify layout to compensate for optical effects',
      examples: [
        {
          language: 'typescript',
          code: `const result = await chip.lithography.run({
  algorithm: 'opc',
  layout: designLayout,
  wavelength: 193,
  process: '7nm',
});`,
        },
      ],
    },
  },
  [AlgorithmCategory.CMP]: {
    dummy_fill: {
      algorithm: 'Dummy Fill Insertion',
      description: 'Insert dummy features for uniform density',
      examples: [
        {
          language: 'typescript',
          code: `const result = await chip.cmp.run({
  algorithm: 'dummy_fill',
  layout: designLayout,
  targetDensity: 0.7,
  minDensity: 0.3,
  maxDensity: 0.8,
});`,
        },
      ],
    },
  },
};
