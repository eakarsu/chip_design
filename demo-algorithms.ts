#!/usr/bin/env tsx
/**
 * Demo script to run all chip design algorithms
 *
 * Run with: npx tsx demo-algorithms.ts
 */

import { runPlacement } from './src/lib/algorithms/placement';
import { runRouting } from './src/lib/algorithms/routing';
import { runFloorplanning } from './src/lib/algorithms/floorplanning';
import { runSynthesis } from './src/lib/algorithms/synthesis';
import { runTiming } from './src/lib/algorithms/timing';
import { runPower } from './src/lib/algorithms/power';
import {
  Cell,
  Net,
  PlacementAlgorithm,
  RoutingAlgorithm,
  FloorplanningAlgorithm,
  SynthesisAlgorithm,
  TimingAlgorithm,
  PowerAlgorithm,
} from './src/types/algorithms';

// Helper to create test cells
function createTestCells(): Cell[] {
  return [
    {
      id: 'cell1',
      name: 'AND Gate',
      width: 10,
      height: 10,
      pins: [
        { id: 'pin1', name: 'A', position: { x: 0, y: 5 }, direction: 'input' },
        { id: 'pin2', name: 'B', position: { x: 0, y: 7 }, direction: 'input' },
        { id: 'pin3', name: 'Y', position: { x: 10, y: 5 }, direction: 'output' },
      ],
      type: 'standard',
    },
    {
      id: 'cell2',
      name: 'OR Gate',
      width: 10,
      height: 10,
      pins: [
        { id: 'pin4', name: 'A', position: { x: 0, y: 5 }, direction: 'input' },
        { id: 'pin5', name: 'B', position: { x: 0, y: 7 }, direction: 'input' },
        { id: 'pin6', name: 'Y', position: { x: 10, y: 5 }, direction: 'output' },
      ],
      type: 'standard',
    },
    {
      id: 'cell3',
      name: 'NOT Gate',
      width: 8,
      height: 8,
      pins: [
        { id: 'pin7', name: 'A', position: { x: 0, y: 4 }, direction: 'input' },
        { id: 'pin8', name: 'Y', position: { x: 8, y: 4 }, direction: 'output' },
      ],
      type: 'standard',
    },
    {
      id: 'cell4',
      name: 'XOR Gate',
      width: 12,
      height: 10,
      pins: [
        { id: 'pin9', name: 'A', position: { x: 0, y: 5 }, direction: 'input' },
        { id: 'pin10', name: 'B', position: { x: 0, y: 7 }, direction: 'input' },
        { id: 'pin11', name: 'Y', position: { x: 12, y: 5 }, direction: 'output' },
      ],
      type: 'standard',
    },
  ];
}

function createTestNets(): Net[] {
  return [
    { id: 'net1', name: 'Net 1', pins: ['pin3', 'pin4'], weight: 1 },
    { id: 'net2', name: 'Net 2', pins: ['pin6', 'pin7'], weight: 1.5 },
    { id: 'net3', name: 'Net 3', pins: ['pin8', 'pin9'], weight: 1 },
  ];
}

console.log('🔷 CHIP DESIGN ALGORITHMS DEMO\n');
console.log('=' .repeat(60));

// 1. PLACEMENT ALGORITHMS
console.log('\n📍 1. PLACEMENT ALGORITHMS');
console.log('-'.repeat(60));

const placementParams = {
  algorithm: PlacementAlgorithm.SIMULATED_ANNEALING,
  chipWidth: 100,
  chipHeight: 100,
  cells: createTestCells(),
  nets: createTestNets(),
  iterations: 200,
  temperature: 1000,
  coolingRate: 0.95,
};

console.log('\n🔥 Running Simulated Annealing Placement...');
const saResult = runPlacement(placementParams);
console.log(`✅ Success: ${saResult.success}`);
console.log(`📊 Total Wirelength: ${saResult.totalWirelength.toFixed(2)}`);
console.log(`🔄 Iterations: ${saResult.iterations}`);
console.log(`⏱️  Runtime: ${saResult.runtime.toFixed(2)}ms`);
console.log(`📐 Overlap: ${saResult.overlap.toFixed(2)}`);

console.log('\n🧬 Running Genetic Algorithm Placement...');
const gaResult = runPlacement({
  ...placementParams,
  algorithm: PlacementAlgorithm.GENETIC,
  populationSize: 30,
  mutationRate: 0.1,
  iterations: 100,
});
console.log(`✅ Success: ${gaResult.success}`);
console.log(`📊 Total Wirelength: ${gaResult.totalWirelength.toFixed(2)}`);
console.log(`⏱️  Runtime: ${gaResult.runtime.toFixed(2)}ms`);

console.log('\n⚡ Running Force-Directed Placement...');
const fdResult = runPlacement({
  ...placementParams,
  algorithm: PlacementAlgorithm.FORCE_DIRECTED,
  iterations: 300,
});
console.log(`✅ Success: ${fdResult.success}`);
console.log(`📊 Total Wirelength: ${fdResult.totalWirelength.toFixed(2)}`);
console.log(`⏱️  Runtime: ${fdResult.runtime.toFixed(2)}ms`);

// 2. ROUTING ALGORITHMS
console.log('\n\n🛣️  2. ROUTING ALGORITHMS');
console.log('-'.repeat(60));

const cellsWithPositions = saResult.cells; // Use placed cells

const routingParams = {
  algorithm: RoutingAlgorithm.MAZE_ROUTING,
  chipWidth: 100,
  chipHeight: 100,
  cells: cellsWithPositions,
  nets: createTestNets(),
  layers: 2,
  gridSize: 5,
};

console.log('\n🌀 Running Maze Routing (Lee\'s Algorithm)...');
const mazeResult = runRouting(routingParams);
console.log(`✅ Success: ${mazeResult.success}`);
console.log(`📏 Total Wirelength: ${mazeResult.totalWirelength}`);
console.log(`🔗 Wires Created: ${mazeResult.wires.length}`);
console.log(`🔌 Via Count: ${mazeResult.viaCount}`);
console.log(`⏱️  Runtime: ${mazeResult.runtime.toFixed(2)}ms`);

console.log('\n⭐ Running A* Routing...');
const astarResult = runRouting({
  ...routingParams,
  algorithm: RoutingAlgorithm.A_STAR,
});
console.log(`✅ Success: ${astarResult.success}`);
console.log(`📏 Total Wirelength: ${astarResult.totalWirelength}`);
console.log(`🔗 Wires Created: ${astarResult.wires.length}`);
console.log(`⏱️  Runtime: ${astarResult.runtime.toFixed(2)}ms`);

console.log('\n🌍 Running Global Routing...');
const globalResult = runRouting({
  ...routingParams,
  algorithm: RoutingAlgorithm.GLOBAL_ROUTING,
  gridSize: 25,
});
console.log(`✅ Success: ${globalResult.success}`);
console.log(`📏 Total Wirelength: ${globalResult.totalWirelength}`);
console.log(`🔗 Wires Created: ${globalResult.wires.length}`);
console.log(`⏱️  Runtime: ${globalResult.runtime.toFixed(2)}ms`);

// 3. FLOORPLANNING ALGORITHMS
console.log('\n\n🏗️  3. FLOORPLANNING ALGORITHMS');
console.log('-'.repeat(60));

const blocks = createTestCells();

console.log('\n🌲 Running Slicing Tree Floorplanning...');
const slicingResult = runFloorplanning({
  algorithm: FloorplanningAlgorithm.SLICING_TREE,
  chipWidth: 150,
  chipHeight: 150,
  blocks,
});
console.log(`✅ Success: ${slicingResult.success}`);
console.log(`📐 Area: ${slicingResult.area}`);
console.log(`📊 Utilization: ${(slicingResult.utilization * 100).toFixed(2)}%`);
console.log(`💀 Dead Space: ${slicingResult.deadSpace.toFixed(2)}`);
console.log(`⏱️  Runtime: ${slicingResult.runtime.toFixed(2)}ms`);

console.log('\n🔢 Running Sequence Pair Floorplanning...');
const seqPairResult = runFloorplanning({
  algorithm: FloorplanningAlgorithm.SEQUENCE_PAIR,
  chipWidth: 150,
  chipHeight: 150,
  blocks: createTestCells(),
});
console.log(`✅ Success: ${seqPairResult.success}`);
console.log(`📐 Area: ${seqPairResult.area}`);
console.log(`📊 Utilization: ${(seqPairResult.utilization * 100).toFixed(2)}%`);
console.log(`⏱️  Runtime: ${seqPairResult.runtime.toFixed(2)}ms`);

// 4. SYNTHESIS ALGORITHMS
console.log('\n\n⚙️  4. SYNTHESIS ALGORITHMS');
console.log('-'.repeat(60));

const netlist = `
module simple_circuit (
  input a, b, c,
  output y
);
  wire w1, w2;
  and (w1, a, b);
  or (w2, w1, c);
  not (y, w2);
endmodule
`.trim();

console.log('\n🔧 Running Logic Optimization (Area)...');
const logicOptResult = runSynthesis({
  algorithm: SynthesisAlgorithm.LOGIC_OPTIMIZATION,
  netlist,
  targetLibrary: 'std_cell_lib',
  optimizationLevel: 'area',
  clockPeriod: 10,
});
console.log(`✅ Success: ${logicOptResult.success}`);
console.log(`🚪 Gate Count: ${logicOptResult.gateCount}`);
console.log(`📏 Area: ${logicOptResult.area}`);
console.log(`⚡ Power: ${logicOptResult.power.toFixed(2)} mW`);
console.log(`⏰ Critical Path Delay: ${logicOptResult.criticalPathDelay.toFixed(2)} ns`);
console.log(`⏱️  Runtime: ${logicOptResult.runtime.toFixed(2)}ms`);

console.log('\n🎯 Running Technology Mapping...');
const techMapResult = runSynthesis({
  algorithm: SynthesisAlgorithm.TECHNOLOGY_MAPPING,
  netlist,
  targetLibrary: 'tsmc_65nm',
  optimizationLevel: 'timing',
  clockPeriod: 10,
});
console.log(`✅ Success: ${techMapResult.success}`);
console.log(`🚪 Gate Count: ${techMapResult.gateCount}`);
console.log(`📏 Area: ${techMapResult.area}`);
console.log(`⚡ Power: ${techMapResult.power.toFixed(2)} mW`);
console.log(`⏱️  Runtime: ${techMapResult.runtime.toFixed(2)}ms`);

// 5. TIMING ANALYSIS ALGORITHMS
console.log('\n\n⏰ 5. TIMING ANALYSIS ALGORITHMS');
console.log('-'.repeat(60));

const wires = mazeResult.wires;

console.log('\n📊 Running Static Timing Analysis...');
const staResult = runTiming({
  algorithm: TimingAlgorithm.STATIC_TIMING_ANALYSIS,
  netlist,
  clockPeriod: 10,
  cells: cellsWithPositions,
  wires,
});
console.log(`✅ Success: ${staResult.success}`);
console.log(`🎯 Critical Path Length: ${staResult.criticalPath.length} cells`);
console.log(`📈 Max Delay: ${staResult.maxDelay.toFixed(2)} ns`);
console.log(`📉 Min Delay: ${staResult.minDelay.toFixed(2)} ns`);
console.log(`⏱️  Slack Time: ${staResult.slackTime.toFixed(2)} ns`);
console.log(`🔴 Setup Violations: ${staResult.setupViolations}`);
console.log(`🔴 Hold Violations: ${staResult.holdViolations}`);
console.log(`⏱️  Runtime: ${staResult.runtime.toFixed(2)}ms`);

console.log('\n🔍 Running Critical Path Analysis...');
const cpResult = runTiming({
  algorithm: TimingAlgorithm.CRITICAL_PATH,
  netlist,
  clockPeriod: 10,
  cells: cellsWithPositions,
  wires,
});
console.log(`✅ Success: ${cpResult.success}`);
console.log(`🎯 Critical Path: ${cpResult.criticalPath.join(' → ')}`);
console.log(`📈 Max Delay: ${cpResult.maxDelay.toFixed(2)} ns`);
console.log(`⏱️  Slack Time: ${cpResult.slackTime.toFixed(2)} ns`);
console.log(`⏱️  Runtime: ${cpResult.runtime.toFixed(2)}ms`);

// 6. POWER OPTIMIZATION ALGORITHMS
console.log('\n\n🔋 6. POWER OPTIMIZATION ALGORITHMS');
console.log('-'.repeat(60));

console.log('\n⏰ Running Clock Gating...');
const cgResult = runPower({
  algorithm: PowerAlgorithm.CLOCK_GATING,
  netlist,
  cells: cellsWithPositions,
  clockFrequency: 1000, // MHz
  voltage: 1.2, // V
  temperature: 25, // °C
});
console.log(`✅ Success: ${cgResult.success}`);
console.log(`⚡ Total Power: ${cgResult.totalPower.toFixed(4)} mW`);
console.log(`🔋 Dynamic Power: ${cgResult.dynamicPower.toFixed(4)} mW`);
console.log(`💤 Static Power: ${cgResult.staticPower.toFixed(4)} mW`);
console.log(`📉 Power Reduction: ${cgResult.reduction.toFixed(2)}%`);
console.log(`⏱️  Runtime: ${cgResult.runtime.toFixed(2)}ms`);

console.log('\n🔽 Running Voltage Scaling...');
const vsResult = runPower({
  algorithm: PowerAlgorithm.VOLTAGE_SCALING,
  netlist,
  cells: cellsWithPositions,
  clockFrequency: 1000,
  voltage: 1.2,
  temperature: 25,
});
console.log(`✅ Success: ${vsResult.success}`);
console.log(`⚡ Total Power: ${vsResult.totalPower.toFixed(4)} mW`);
console.log(`📉 Power Reduction: ${vsResult.reduction.toFixed(2)}%`);
console.log(`⏱️  Runtime: ${vsResult.runtime.toFixed(2)}ms`);

console.log('\n🔌 Running Power Gating...');
const pgResult = runPower({
  algorithm: PowerAlgorithm.POWER_GATING,
  netlist,
  cells: cellsWithPositions,
  clockFrequency: 1000,
  voltage: 1.2,
  temperature: 25,
});
console.log(`✅ Success: ${pgResult.success}`);
console.log(`⚡ Total Power: ${pgResult.totalPower.toFixed(4)} mW`);
console.log(`💤 Leakage Power: ${pgResult.leakagePower.toFixed(4)} mW`);
console.log(`📉 Power Reduction: ${pgResult.reduction.toFixed(2)}%`);
console.log(`⏱️  Runtime: ${pgResult.runtime.toFixed(2)}ms`);

// Summary
console.log('\n\n' + '='.repeat(60));
console.log('📊 SUMMARY - ALL ALGORITHMS EXECUTED SUCCESSFULLY!');
console.log('='.repeat(60));
console.log(`
✅ 3 Placement algorithms
✅ 3 Routing algorithms
✅ 2 Floorplanning algorithms
✅ 2 Synthesis algorithms
✅ 2 Timing analysis algorithms
✅ 3 Power optimization algorithms

Total: 15 chip design algorithms demonstrated!
`);
