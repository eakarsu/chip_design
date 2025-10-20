#!/usr/bin/env tsx
/**
 * Quick validation script to test all 31 algorithms
 * Run with: npx tsx validate-algorithms.ts
 */

import {
  runPlacement,
  runRouting,
  runFloorplanning,
  runSynthesis,
  runTiming,
  runPower,
  runClockTree,
  runPartitioning,
  runVerification,
  runRL,
} from './src/lib/algorithms';
import {
  PlacementAlgorithm,
  RoutingAlgorithm,
  FloorplanningAlgorithm,
  SynthesisAlgorithm,
  TimingAlgorithm,
  PowerAlgorithm,
  ClockTreeAlgorithm,
  PartitioningAlgorithm,
  DRCLVSAlgorithm,
  RLAlgorithm,
  Cell,
  Net,
} from './src/types/algorithms';

// Test data
function createTestCells(count: number = 5): Cell[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `cell_${i}`,
    name: `Cell ${i}`,
    width: 10,
    height: 10,
    pins: [
      { id: `pin_${i}_0`, name: 'A', position: { x: 5, y: 5 }, direction: 'input' as const },
      { id: `pin_${i}_1`, name: 'Y', position: { x: 5, y: 5 }, direction: 'output' as const },
    ],
    type: 'standard' as const,
  }));
}

function createTestNets(count: number = 4): Net[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `net_${i}`,
    name: `Net ${i}`,
    pins: [`pin_${i}_1`, `pin_${(i + 1) % count}_0`],
    weight: 1.0,
  }));
}

const cells = createTestCells(5);
const nets = createTestNets(4);
const chipWidth = 100;
const chipHeight = 100;

let passed = 0;
let failed = 0;

function test(name: string, fn: () => any) {
  try {
    const result = fn();
    if (result && result.success !== false) {
      console.log(`✓ ${name}`);
      passed++;
    } else {
      console.log(`✗ ${name} - returned unsuccessful result`);
      failed++;
    }
  } catch (error) {
    console.log(`✗ ${name} - ${error instanceof Error ? error.message : 'Unknown error'}`);
    failed++;
  }
}

console.log('\n🧪 Validating All 31 Chip Design Algorithms...\n');

// Placement (3)
console.log('📍 PLACEMENT ALGORITHMS:');
test('Simulated Annealing', () =>
  runPlacement({ algorithm: PlacementAlgorithm.SIMULATED_ANNEALING, chipWidth, chipHeight, cells, nets, iterations: 10 })
);
test('Genetic Algorithm', () =>
  runPlacement({ algorithm: PlacementAlgorithm.GENETIC, chipWidth, chipHeight, cells, nets, iterations: 10, populationSize: 10, mutationRate: 0.1 })
);
test('Force-Directed', () =>
  runPlacement({ algorithm: PlacementAlgorithm.FORCE_DIRECTED, chipWidth, chipHeight, cells, nets, iterations: 10 })
);

// Routing (3)
console.log('\n🔀 ROUTING ALGORITHMS:');
const placedCells = cells.map((c, i) => ({ ...c, position: { x: i * 20, y: i * 20 } }));
test('Maze Routing (Lee)', () =>
  runRouting({ algorithm: RoutingAlgorithm.MAZE_ROUTING, chipWidth, chipHeight, cells: placedCells, nets, layers: 2, gridSize: 5 })
);
test('A* Routing', () =>
  runRouting({ algorithm: RoutingAlgorithm.A_STAR, chipWidth, chipHeight, cells: placedCells, nets, layers: 3, gridSize: 5 })
);
test('Global Routing', () =>
  runRouting({ algorithm: RoutingAlgorithm.GLOBAL_ROUTING, chipWidth, chipHeight, cells: placedCells, nets, layers: 2, gridSize: 20 })
);

// Floorplanning (2)
console.log('\n📐 FLOORPLANNING ALGORITHMS:');
test('Slicing Tree', () =>
  runFloorplanning({ algorithm: FloorplanningAlgorithm.SLICING_TREE, chipWidth, chipHeight, blocks: cells })
);
test('Sequence Pair', () =>
  runFloorplanning({ algorithm: FloorplanningAlgorithm.SEQUENCE_PAIR, chipWidth, chipHeight, blocks: cells })
);

// Synthesis (2)
console.log('\n⚙️  SYNTHESIS ALGORITHMS:');
const netlist = 'module test(input a, b, output y); and g1(y, a, b); endmodule';
test('Logic Optimization', () =>
  runSynthesis({ algorithm: SynthesisAlgorithm.LOGIC_OPTIMIZATION, netlist, targetLibrary: 'std', optimizationLevel: 'area', clockPeriod: 10 })
);
test('Technology Mapping', () =>
  runSynthesis({ algorithm: SynthesisAlgorithm.TECHNOLOGY_MAPPING, netlist, targetLibrary: 'std', optimizationLevel: 'timing', clockPeriod: 10 })
);

// Timing (2)
console.log('\n⏱️  TIMING ANALYSIS ALGORITHMS:');
test('Static Timing Analysis', () =>
  runTiming({ algorithm: TimingAlgorithm.STATIC_TIMING_ANALYSIS, netlist, clockPeriod: 50, cells: placedCells, wires: [] })
);
test('Critical Path Analysis', () =>
  runTiming({ algorithm: TimingAlgorithm.CRITICAL_PATH, netlist, clockPeriod: 50, cells: placedCells, wires: [] })
);

// Power (3)
console.log('\n⚡ POWER OPTIMIZATION ALGORITHMS:');
test('Clock Gating', () =>
  runPower({ algorithm: PowerAlgorithm.CLOCK_GATING, netlist, cells, clockFrequency: 1000, voltage: 1.2, temperature: 85 })
);
test('Voltage Scaling (DVFS)', () =>
  runPower({ algorithm: PowerAlgorithm.VOLTAGE_SCALING, netlist, cells, clockFrequency: 1000, voltage: 1.2, temperature: 85 })
);
test('Power Gating', () =>
  runPower({ algorithm: PowerAlgorithm.POWER_GATING, netlist, cells, clockFrequency: 1000, voltage: 1.2, temperature: 85 })
);

// Clock Tree (4)
console.log('\n🕐 CLOCK TREE SYNTHESIS ALGORITHMS:');
const sinks = Array.from({ length: 4 }, (_, i) => ({ x: i * 25, y: i * 25 }));
test('H-Tree', () =>
  runClockTree({ algorithm: ClockTreeAlgorithm.H_TREE, clockSource: { x: 50, y: 50 }, sinks, chipWidth, chipHeight })
);
test('X-Tree', () =>
  runClockTree({ algorithm: ClockTreeAlgorithm.X_TREE, clockSource: { x: 50, y: 50 }, sinks, chipWidth, chipHeight })
);
test('Mesh Clock', () =>
  runClockTree({ algorithm: ClockTreeAlgorithm.MESH_CLOCK, clockSource: { x: 50, y: 50 }, sinks, chipWidth, chipHeight, meshDensity: 4 })
);
test('DME Algorithm', () =>
  runClockTree({ algorithm: ClockTreeAlgorithm.MMM_ALGORITHM, clockSource: { x: 50, y: 50 }, sinks, chipWidth, chipHeight })
);

// Partitioning (3)
console.log('\n✂️  PARTITIONING ALGORITHMS:');
test('Kernighan-Lin', () =>
  runPartitioning({ algorithm: PartitioningAlgorithm.KERNIGHAN_LIN, cells, nets, partitionCount: 2, maxIterations: 2 })
);
test('Fiduccia-Mattheyses', () =>
  runPartitioning({ algorithm: PartitioningAlgorithm.FIDUCCIA_MATTHEYSES, cells, nets, partitionCount: 2, maxIterations: 2 })
);
test('Multi-Level', () =>
  runPartitioning({ algorithm: PartitioningAlgorithm.MULTILEVEL, cells, nets, partitionCount: 2, maxIterations: 2 })
);

// DRC/LVS (3)
console.log('\n✅ DRC/LVS VERIFICATION ALGORITHMS:');
const wires = [
  { id: 'w0', netId: 'net_0', points: [{ x: 10, y: 10 }, { x: 30, y: 10 }], layer: 1, width: 0.2 },
];
test('Design Rule Check', () =>
  runVerification({ algorithm: DRCLVSAlgorithm.DESIGN_RULE_CHECK, cells: placedCells, wires })
);
test('Layout vs Schematic', () =>
  runVerification({ algorithm: DRCLVSAlgorithm.LAYOUT_VS_SCHEMATIC, cells: placedCells, wires, netlist: 'module test(); wire net_0; endmodule' })
);
test('Electrical Rule Check', () =>
  runVerification({ algorithm: DRCLVSAlgorithm.ELECTRICAL_RULE_CHECK, cells: placedCells, wires })
);

// Reinforcement Learning (5)
console.log('\n🤖 REINFORCEMENT LEARNING ALGORITHMS:');
const rlCells = createTestCells(2);
const rlNets = createTestNets(1);
test('DQN Floorplanning', () =>
  runRL({ algorithm: RLAlgorithm.DQN_FLOORPLANNING, cells: rlCells, nets: rlNets, chipWidth: 50, chipHeight: 50, episodes: 1, learningRate: 0.01, discountFactor: 0.9, epsilon: 0.1, batchSize: 1 })
);
test('PPO Floorplanning', () =>
  runRL({ algorithm: RLAlgorithm.PPO_FLOORPLANNING, cells: rlCells, nets: rlNets, chipWidth: 50, chipHeight: 50, episodes: 1, learningRate: 0.001, discountFactor: 0.9, epsilon: 0.2 })
);
test('Q-Learning Placement', () =>
  runRL({ algorithm: RLAlgorithm.Q_LEARNING_PLACEMENT, cells: rlCells, nets: rlNets, chipWidth: 50, chipHeight: 50, episodes: 1, learningRate: 0.1, discountFactor: 0.9, epsilon: 0.1 })
);
test('Policy Gradient Placement', () =>
  runRL({ algorithm: RLAlgorithm.POLICY_GRADIENT_PLACEMENT, cells: rlCells, nets: rlNets, chipWidth: 50, chipHeight: 50, episodes: 1, learningRate: 0.01, discountFactor: 0.9 })
);
test('Actor-Critic Routing', () =>
  runRL({ algorithm: RLAlgorithm.ACTOR_CRITIC_ROUTING, cells: rlCells, nets: rlNets, chipWidth: 50, chipHeight: 50, episodes: 1, learningRate: 0.001, discountFactor: 0.9, epsilon: 0.1 })
);

// Summary
console.log('\n' + '='.repeat(50));
console.log(`\n📊 RESULTS: ${passed} passed, ${failed} failed out of 31 tests`);
console.log(`\n✨ Coverage: ${((passed / 31) * 100).toFixed(1)}%\n`);

if (failed === 0) {
  console.log('🎉 ALL ALGORITHMS VALIDATED SUCCESSFULLY!\n');
  process.exit(0);
} else {
  console.log('⚠️  Some algorithms failed validation\n');
  process.exit(1);
}
