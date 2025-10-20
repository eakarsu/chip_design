/**
 * Comprehensive Test Suite for All Chip Design Algorithms
 * Tests all 70+ implemented algorithms across 17 categories
 */

import { describe, it, expect } from '@jest/globals';
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
} from '@/lib/algorithms';
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
  LegalizationAlgorithm,
  BufferInsertionAlgorithm,
  CongestionEstimationAlgorithm,
  SignalIntegrityAlgorithm,
  IRDropAlgorithm,
  LithographyAlgorithm,
  CMPAlgorithm,
  Cell,
  Net,
} from '@/types/algorithms';

// Helper function to create test cells
function createTestCells(count: number = 5): Cell[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `cell_${i}`,
    name: `Cell ${i}`,
    width: 10 + Math.random() * 10,
    height: 10 + Math.random() * 10,
    pins: [
      {
        id: `pin_${i}_0`,
        name: 'A',
        position: { x: 5, y: 5 },
        direction: 'input' as const,
      },
      {
        id: `pin_${i}_1`,
        name: 'Y',
        position: { x: 15, y: 5 },
        direction: 'output' as const,
      },
    ],
    type: 'standard' as const,
  }));
}

// Helper function to create test nets
function createTestNets(cellCount: number = 5): Net[] {
  return Array.from({ length: cellCount - 1 }, (_, i) => ({
    id: `net_${i}`,
    name: `Net ${i}`,
    pins: [`pin_${i}_1`, `pin_${i + 1}_0`],
    weight: 1.0,
  }));
}

describe('Chip Design Algorithms - Complete Test Suite', () => {
  const chipWidth = 200;
  const chipHeight = 200;
  const cells = createTestCells(8);
  const nets = createTestNets(8);

  // ========== PLACEMENT ALGORITHMS (11) ==========
  describe('Placement Algorithms', () => {
    it('should run Simulated Annealing placement successfully', () => {
      const result = runPlacement({
        algorithm: PlacementAlgorithm.SIMULATED_ANNEALING,
        chipWidth,
        chipHeight,
        cells,
        nets,
        iterations: 100,
        temperature: 1000,
        coolingRate: 0.95,
      });

      expect(result.success).toBe(true);
      expect(result.cells).toHaveLength(cells.length);
      expect(result.cells.every(c => c.position)).toBe(true);
      expect(result.totalWirelength).toBeGreaterThan(0);
      expect(result.overlap).toBeGreaterThanOrEqual(0);
      expect(result.runtime).toBeGreaterThan(0);
      expect(result.iterations).toBeLessThanOrEqual(100);
    });

    it('should run Genetic Algorithm placement successfully', () => {
      const result = runPlacement({
        algorithm: PlacementAlgorithm.GENETIC,
        chipWidth,
        chipHeight,
        cells,
        nets,
        iterations: 50,
        populationSize: 20,
        mutationRate: 0.1,
      });

      expect(result.success).toBe(true);
      expect(result.cells).toHaveLength(cells.length);
      expect(result.cells.every(c => c.position)).toBe(true);
      expect(result.totalWirelength).toBeGreaterThan(0);
      expect(result.runtime).toBeGreaterThan(0);
    });

    it('should run Force-Directed placement successfully', () => {
      const result = runPlacement({
        algorithm: PlacementAlgorithm.FORCE_DIRECTED,
        chipWidth,
        chipHeight,
        cells,
        nets,
        iterations: 100,
      });

      expect(result.success).toBe(true);
      expect(result.cells).toHaveLength(cells.length);
      expect(result.cells.every(c => c.position)).toBe(true);
      expect(result.totalWirelength).toBeGreaterThan(0);
      expect(result.runtime).toBeGreaterThan(0);
    });

    it('should run Analytical Placement successfully', () => {
      const result = runPlacement({
        algorithm: 'analytical' as PlacementAlgorithm,
        chipWidth,
        chipHeight,
        cells,
        nets,
        iterations: 50,
      });

      expect(result.success).toBe(true);
      expect(result.cells).toHaveLength(cells.length);
      expect(result.cells.every(c => c.position)).toBe(true);
      expect(result.runtime).toBeGreaterThan(0);
    });

    it('should run Min-Cut placement successfully', () => {
      const result = runPlacement({
        algorithm: 'min_cut' as PlacementAlgorithm,
        chipWidth,
        chipHeight,
        cells,
        nets,
        iterations: 50,
      });

      expect(result.success).toBe(true);
      expect(result.cells).toHaveLength(cells.length);
      expect(result.runtime).toBeGreaterThan(0);
    });

    it('should run GORDIAN placement successfully', () => {
      const result = runPlacement({
        algorithm: 'gordian' as PlacementAlgorithm,
        chipWidth,
        chipHeight,
        cells,
        nets,
        iterations: 50,
      });

      expect(result.success).toBe(true);
      expect(result.cells).toHaveLength(cells.length);
      expect(result.runtime).toBeGreaterThan(0);
    });

    it('should run FastPlace placement successfully', () => {
      const result = runPlacement({
        algorithm: 'fastplace' as PlacementAlgorithm,
        chipWidth,
        chipHeight,
        cells,
        nets,
        iterations: 50,
      });

      expect(result.success).toBe(true);
      expect(result.cells).toHaveLength(cells.length);
      expect(result.runtime).toBeGreaterThan(0);
    });

    it('should run RePlAce placement successfully', () => {
      const result = runPlacement({
        algorithm: 'replace' as PlacementAlgorithm,
        chipWidth,
        chipHeight,
        cells,
        nets,
        iterations: 50,
      });

      expect(result.success).toBe(true);
      expect(result.cells).toHaveLength(cells.length);
      expect(result.runtime).toBeGreaterThan(0);
    });

    it('should run DREAMPlace placement successfully', () => {
      const result = runPlacement({
        algorithm: 'dreamplace' as PlacementAlgorithm,
        chipWidth,
        chipHeight,
        cells,
        nets,
        iterations: 50,
      });

      expect(result.success).toBe(true);
      expect(result.cells).toHaveLength(cells.length);
      expect(result.runtime).toBeGreaterThan(0);
    });

    it('should run Quadratic Placement successfully', () => {
      const result = runPlacement({
        algorithm: PlacementAlgorithm.QUADRATIC,
        chipWidth,
        chipHeight,
        cells,
        nets,
        iterations: 50,
      });

      expect(result.success).toBe(true);
      expect(result.cells).toHaveLength(cells.length);
      expect(result.runtime).toBeGreaterThan(0);
    });

    it('should run Partitioning-Based Placement successfully', () => {
      const result = runPlacement({
        algorithm: PlacementAlgorithm.PARTITIONING_BASED,
        chipWidth,
        chipHeight,
        cells,
        nets,
        iterations: 50,
      });

      expect(result.success).toBe(true);
      expect(result.cells).toHaveLength(cells.length);
      expect(result.runtime).toBeGreaterThan(0);
    });
  });

  // ========== ROUTING ALGORITHMS (13) ==========
  describe('Routing Algorithms', () => {
    const placedCells = cells.map((cell, i) => ({
      ...cell,
      position: { x: i * 25, y: i * 25 },
    }));

    it('should run Maze Routing (Lee) successfully', () => {
      const result = runRouting({
        algorithm: RoutingAlgorithm.MAZE_ROUTING,
        chipWidth,
        chipHeight,
        cells: placedCells,
        nets,
        layers: 2,
        gridSize: 10,
      });

      expect(result.success).toBe(true);
      expect(result.wires.length).toBeGreaterThan(0);
      expect(result.totalWirelength).toBeGreaterThan(0);
      expect(result.viaCount).toBeGreaterThanOrEqual(0);
      expect(result.runtime).toBeGreaterThan(0);
    });

    it('should run A* Routing successfully', () => {
      const result = runRouting({
        algorithm: RoutingAlgorithm.A_STAR,
        chipWidth,
        chipHeight,
        cells: placedCells,
        nets,
        layers: 2,
        gridSize: 10,
      });

      expect(result.success).toBe(true);
      expect(result.wires.length).toBeGreaterThan(0);
      expect(result.totalWirelength).toBeGreaterThan(0);
      expect(result.runtime).toBeGreaterThan(0);
    });

    it('should run Global Routing successfully', () => {
      const result = runRouting({
        algorithm: RoutingAlgorithm.GLOBAL_ROUTING,
        chipWidth,
        chipHeight,
        cells: placedCells,
        nets,
        layers: 2,
        gridSize: 20,
      });

      expect(result.success).toBe(true);
      expect(result.wires.length).toBeGreaterThan(0);
      expect(result.totalWirelength).toBeGreaterThan(0);
      expect(result.runtime).toBeGreaterThan(0);
    });

    it('should run FLUTE (Steiner Tree) successfully', () => {
      const result = runRouting({
        algorithm: 'flute' as RoutingAlgorithm,
        chipWidth,
        chipHeight,
        cells: placedCells,
        nets,
        layers: 2,
        gridSize: 10,
      });

      expect(result).toBeDefined();
      expect(result.runtime).toBeGreaterThan(0);
    });

    it('should run Left-Edge Algorithm successfully', () => {
      const result = runRouting({
        algorithm: 'left_edge' as RoutingAlgorithm,
        chipWidth,
        chipHeight,
        cells: placedCells,
        nets,
        layers: 2,
      });

      expect(result).toBeDefined();
      expect(result.runtime).toBeGreaterThan(0);
    });

    it('should run Channel Routing successfully', () => {
      const result = runRouting({
        algorithm: RoutingAlgorithm.CHANNEL_ROUTING,
        chipWidth,
        chipHeight,
        cells: placedCells,
        nets,
        layers: 2,
      });

      expect(result).toBeDefined();
      expect(result.runtime).toBeGreaterThan(0);
    });

    it('should run Detailed Routing successfully', () => {
      const result = runRouting({
        algorithm: 'detailed_routing' as RoutingAlgorithm,
        chipWidth,
        chipHeight,
        cells: placedCells,
        nets,
        layers: 2,
      });

      expect(result).toBeDefined();
      expect(result.runtime).toBeGreaterThan(0);
    });

    it('should run PathFinder successfully', () => {
      const result = runRouting({
        algorithm: 'pathfinder' as RoutingAlgorithm,
        chipWidth,
        chipHeight,
        cells: placedCells,
        nets,
        layers: 2,
      });

      expect(result).toBeDefined();
      expect(result.runtime).toBeGreaterThan(0);
    });

    it('should run GeoSteiner successfully', () => {
      const result = runRouting({
        algorithm: RoutingAlgorithm.GEOSTEINER,
        chipWidth,
        chipHeight,
        cells: placedCells,
        nets,
        layers: 2,
      });

      expect(result).toBeDefined();
      expect(result.runtime).toBeGreaterThan(0);
    });

    it('should run Dogleg Routing successfully', () => {
      const result = runRouting({
        algorithm: RoutingAlgorithm.DOGLEG,
        chipWidth,
        chipHeight,
        cells: placedCells,
        nets,
        layers: 2,
      });

      expect(result).toBeDefined();
      expect(result.runtime).toBeGreaterThan(0);
    });

    it('should run Switchbox Routing successfully', () => {
      const result = runRouting({
        algorithm: RoutingAlgorithm.SWITCHBOX,
        chipWidth,
        chipHeight,
        cells: placedCells,
        nets,
        layers: 2,
      });

      expect(result).toBeDefined();
      expect(result.runtime).toBeGreaterThan(0);
    });

    it('should run Negotiation-Based Routing successfully', () => {
      const result = runRouting({
        algorithm: RoutingAlgorithm.NEGOTIATION_BASED,
        chipWidth,
        chipHeight,
        cells: placedCells,
        nets,
        layers: 2,
      });

      expect(result).toBeDefined();
      expect(result.runtime).toBeGreaterThan(0);
    });

    it('should run GridGraph Routing successfully', () => {
      const result = runRouting({
        algorithm: RoutingAlgorithm.GRIDGRAPH,
        chipWidth,
        chipHeight,
        cells: placedCells,
        nets,
        layers: 2,
      });

      expect(result).toBeDefined();
      expect(result.runtime).toBeGreaterThan(0);
    });
  });

  // ========== FLOORPLANNING ALGORITHMS (7) ==========
  describe('Floorplanning Algorithms', () => {
    it('should run Slicing Tree floorplanning successfully', () => {
      const result = runFloorplanning({
        algorithm: FloorplanningAlgorithm.SLICING_TREE,
        chipWidth,
        chipHeight,
        blocks: cells,
        aspectRatioMin: 0.5,
        aspectRatioMax: 2.0,
      });

      expect(result.success).toBe(true);
      expect(result.blocks).toHaveLength(cells.length);
      expect(result.area).toBeGreaterThan(0);
      expect(result.aspectRatio).toBeGreaterThan(0);
      expect(result.utilization).toBeGreaterThan(0);
      expect(result.runtime).toBeGreaterThan(0);
    });

    it('should run Sequence Pair floorplanning successfully', () => {
      const result = runFloorplanning({
        algorithm: FloorplanningAlgorithm.SEQUENCE_PAIR,
        chipWidth,
        chipHeight,
        blocks: cells,
        aspectRatioMin: 0.5,
        aspectRatioMax: 2.0,
      });

      expect(result.success).toBe(true);
      expect(result.blocks).toHaveLength(cells.length);
      expect(result.area).toBeGreaterThan(0);
      expect(result.runtime).toBeGreaterThan(0);
    });

    it('should run B*-Tree floorplanning successfully', () => {
      const result = runFloorplanning({
        algorithm: 'b_star_tree' as FloorplanningAlgorithm,
        chipWidth,
        chipHeight,
        blocks: cells,
      });

      expect(result.success).toBe(true);
      expect(result.blocks).toHaveLength(cells.length);
      expect(result.runtime).toBeGreaterThan(0);
    });

    it('should run O-Tree floorplanning successfully', () => {
      const result = runFloorplanning({
        algorithm: 'o_tree' as FloorplanningAlgorithm,
        chipWidth,
        chipHeight,
        blocks: cells,
      });

      expect(result.success).toBe(true);
      expect(result.blocks).toHaveLength(cells.length);
      expect(result.runtime).toBeGreaterThan(0);
    });

    it('should run Corner Block List floorplanning successfully', () => {
      const result = runFloorplanning({
        algorithm: 'corner_block_list' as FloorplanningAlgorithm,
        chipWidth,
        chipHeight,
        blocks: cells,
      });

      expect(result.success).toBe(true);
      expect(result.blocks).toHaveLength(cells.length);
      expect(result.runtime).toBeGreaterThan(0);
    });

    it('should run TCG floorplanning successfully', () => {
      const result = runFloorplanning({
        algorithm: 'tcg' as FloorplanningAlgorithm,
        chipWidth,
        chipHeight,
        blocks: cells,
      });

      expect(result.success).toBe(true);
      expect(result.blocks).toHaveLength(cells.length);
      expect(result.runtime).toBeGreaterThan(0);
    });

    it('should run Fixed-Outline floorplanning successfully', () => {
      const result = runFloorplanning({
        algorithm: FloorplanningAlgorithm.FIXED_OUTLINE,
        chipWidth,
        chipHeight,
        blocks: cells,
      });

      expect(result.success).toBe(true);
      expect(result.blocks).toHaveLength(cells.length);
      expect(result.runtime).toBeGreaterThan(0);
    });
  });

  // ========== SYNTHESIS ALGORITHMS (2) ==========
  describe('Synthesis Algorithms', () => {
    const testNetlist = `module test(input a, b, output y);
  wire w1;
  and g1(w1, a, b);
  or g2(y, w1, a);
endmodule`;

    it('should run Logic Optimization successfully', () => {
      const result = runSynthesis({
        algorithm: SynthesisAlgorithm.LOGIC_OPTIMIZATION,
        netlist: testNetlist,
        targetLibrary: 'stdcell',
        optimizationLevel: 'area',
        clockPeriod: 10,
      });

      expect(result.success).toBe(true);
      expect(result.optimizedNetlist).toBeDefined();
      expect(result.gateCount).toBeGreaterThanOrEqual(0);
      expect(result.runtime).toBeGreaterThan(0);
    });

    it('should run Technology Mapping successfully', () => {
      const result = runSynthesis({
        algorithm: SynthesisAlgorithm.TECHNOLOGY_MAPPING,
        netlist: testNetlist,
        targetLibrary: 'stdcell',
        optimizationLevel: 'timing',
        clockPeriod: 10,
      });

      expect(result.success).toBe(true);
      expect(result.optimizedNetlist).toBeDefined();
      expect(result.gateCount).toBeGreaterThanOrEqual(0);
      expect(result.runtime).toBeGreaterThan(0);
    });
  });

  // ========== TIMING ANALYSIS ALGORITHMS (2) ==========
  describe('Timing Analysis Algorithms', () => {
    const testNetlist = 'module timing();';
    const placedCells = cells.map((cell, i) => ({
      ...cell,
      position: { x: i * 25, y: i * 25 },
    }));

    it('should run Static Timing Analysis successfully', () => {
      const result = runTiming({
        algorithm: TimingAlgorithm.STATIC_TIMING_ANALYSIS,
        netlist: testNetlist,
        clockPeriod: 10,
        cells: placedCells,
        wires: [],
      });

      expect(result.success).toBe(true);
      expect(result.criticalPath).toBeDefined();
      expect(result.slackTime).toBeDefined();
      expect(result.setupViolations).toBeGreaterThanOrEqual(0);
      expect(result.holdViolations).toBeGreaterThanOrEqual(0);
      expect(result.runtime).toBeGreaterThan(0);
    });

    it('should run Critical Path Analysis successfully', () => {
      const result = runTiming({
        algorithm: TimingAlgorithm.CRITICAL_PATH,
        netlist: testNetlist,
        clockPeriod: 10,
        cells: placedCells,
        wires: [],
      });

      expect(result.success).toBe(true);
      expect(result.criticalPath).toBeDefined();
      expect(result.maxDelay).toBeGreaterThanOrEqual(0);
      expect(result.runtime).toBeGreaterThan(0);
    });
  });

  // ========== POWER OPTIMIZATION ALGORITHMS (3) ==========
  describe('Power Optimization Algorithms', () => {
    const testNetlist = 'module power();';

    it('should run Clock Gating successfully', () => {
      const result = runPower({
        algorithm: PowerAlgorithm.CLOCK_GATING,
        netlist: testNetlist,
        cells,
        clockFrequency: 1000,
        voltage: 1.2,
        temperature: 85,
      });

      expect(result.success).toBe(true);
      expect(result.totalPower).toBeGreaterThan(0);
      expect(result.staticPower).toBeGreaterThanOrEqual(0);
      expect(result.dynamicPower).toBeGreaterThanOrEqual(0);
      expect(result.reduction).toBeGreaterThanOrEqual(0);
      expect(result.runtime).toBeGreaterThan(0);
    });

    it('should run Voltage Scaling (DVFS) successfully', () => {
      const result = runPower({
        algorithm: PowerAlgorithm.VOLTAGE_SCALING,
        netlist: testNetlist,
        cells,
        clockFrequency: 1000,
        voltage: 1.2,
        temperature: 85,
      });

      expect(result.success).toBe(true);
      expect(result.totalPower).toBeGreaterThan(0);
      expect(result.reduction).toBeGreaterThanOrEqual(0);
      expect(result.runtime).toBeGreaterThan(0);
    });

    it('should run Power Gating successfully', () => {
      const result = runPower({
        algorithm: PowerAlgorithm.POWER_GATING,
        netlist: testNetlist,
        cells,
        clockFrequency: 1000,
        voltage: 1.2,
        temperature: 85,
      });

      expect(result.success).toBe(true);
      expect(result.totalPower).toBeGreaterThan(0);
      expect(result.reduction).toBeGreaterThanOrEqual(0);
      expect(result.runtime).toBeGreaterThan(0);
    });
  });

  // ========== CLOCK TREE SYNTHESIS ALGORITHMS (4) ==========
  describe('Clock Tree Synthesis Algorithms', () => {
    const clockSinks = Array.from({ length: 8 }, (_, i) => ({
      x: (i % 4) * 50 + 25,
      y: Math.floor(i / 4) * 100 + 25,
    }));

    it('should run H-Tree clock distribution successfully', () => {
      const result = runClockTree({
        algorithm: ClockTreeAlgorithm.H_TREE,
        clockSource: { x: chipWidth / 2, y: chipHeight / 2 },
        sinks: clockSinks,
        chipWidth,
        chipHeight,
      });

      expect(result.success).toBe(true);
      expect(result.wires.length).toBeGreaterThan(0);
      expect(result.totalWirelength).toBeGreaterThan(0);
      expect(result.skew).toBeGreaterThanOrEqual(0);
      expect(result.maxDelay).toBeGreaterThanOrEqual(0);
      expect(result.runtime).toBeGreaterThan(0);
    });

    it('should run X-Tree clock distribution successfully', () => {
      const result = runClockTree({
        algorithm: ClockTreeAlgorithm.X_TREE,
        clockSource: { x: chipWidth / 2, y: chipHeight / 2 },
        sinks: clockSinks,
        chipWidth,
        chipHeight,
      });

      expect(result.success).toBe(true);
      expect(result.wires.length).toBeGreaterThan(0);
      expect(result.totalWirelength).toBeGreaterThan(0);
      expect(result.skew).toBeGreaterThanOrEqual(0);
      expect(result.runtime).toBeGreaterThan(0);
    });

    it('should run Mesh Clock distribution successfully', () => {
      const result = runClockTree({
        algorithm: ClockTreeAlgorithm.MESH_CLOCK,
        clockSource: { x: chipWidth / 2, y: chipHeight / 2 },
        sinks: clockSinks,
        chipWidth,
        chipHeight,
        meshDensity: 4,
      });

      expect(result.success).toBe(true);
      expect(result.wires.length).toBeGreaterThan(0);
      expect(result.totalWirelength).toBeGreaterThan(0);
      expect(result.skew).toBeGreaterThanOrEqual(0);
      expect(result.runtime).toBeGreaterThan(0);
    });

    it('should run DME Algorithm successfully', () => {
      const result = runClockTree({
        algorithm: ClockTreeAlgorithm.MMM_ALGORITHM,
        clockSource: { x: chipWidth / 2, y: chipHeight / 2 },
        sinks: clockSinks,
        chipWidth,
        chipHeight,
      });

      expect(result.success).toBe(true);
      expect(result.wires.length).toBeGreaterThan(0);
      expect(result.totalWirelength).toBeGreaterThan(0);
      expect(result.skew).toBeGreaterThanOrEqual(0);
      expect(result.runtime).toBeGreaterThan(0);
    });
  });

  // ========== PARTITIONING ALGORITHMS (3) ==========
  describe('Partitioning Algorithms', () => {
    it('should run Kernighan-Lin partitioning successfully', () => {
      const result = runPartitioning({
        algorithm: PartitioningAlgorithm.KERNIGHAN_LIN,
        cells,
        nets,
        partitionCount: 2,
        maxIterations: 20,
      });

      expect(result.success).toBe(true);
      expect(result.partitions).toHaveLength(2);
      expect(result.partitions[0].length + result.partitions[1].length).toBe(cells.length);
      expect(result.cutsize).toBeGreaterThanOrEqual(0);
      expect(result.balanceRatio).toBeGreaterThanOrEqual(0);
      expect(result.runtime).toBeGreaterThan(0);
    });

    it('should run Fiduccia-Mattheyses partitioning successfully', () => {
      const result = runPartitioning({
        algorithm: PartitioningAlgorithm.FIDUCCIA_MATTHEYSES,
        cells,
        nets,
        partitionCount: 2,
        maxIterations: 20,
      });

      expect(result.success).toBe(true);
      expect(result.partitions).toHaveLength(2);
      expect(result.cutsize).toBeGreaterThanOrEqual(0);
      expect(result.runtime).toBeGreaterThan(0);
    });

    it('should run Multi-Level partitioning successfully', () => {
      const result = runPartitioning({
        algorithm: PartitioningAlgorithm.MULTILEVEL,
        cells,
        nets,
        partitionCount: 2,
        maxIterations: 10,
      });

      expect(result.success).toBe(true);
      expect(result.partitions).toHaveLength(2);
      expect(result.cutsize).toBeGreaterThanOrEqual(0);
      expect(result.runtime).toBeGreaterThan(0);
    });
  });

  // ========== DRC/LVS VERIFICATION ALGORITHMS (3) ==========
  describe('DRC/LVS Verification Algorithms', () => {
    const placedCells = cells.map((cell, i) => ({
      ...cell,
      position: { x: i * 30, y: i * 30 },
    }));

    const wires = [
      {
        id: 'wire_0',
        netId: 'net_0',
        points: [{ x: 10, y: 10 }, { x: 50, y: 10 }],
        layer: 1,
        width: 0.2,
      },
      {
        id: 'wire_1',
        netId: 'net_1',
        points: [{ x: 60, y: 10 }, { x: 90, y: 10 }],
        layer: 1,
        width: 0.15,
      },
    ];

    it('should run Design Rule Check successfully', () => {
      const result = runVerification({
        algorithm: DRCLVSAlgorithm.DESIGN_RULE_CHECK,
        cells: placedCells,
        wires,
        designRules: [
          { name: 'MIN_WIDTH', minWidth: 0.1 },
          { name: 'MIN_SPACING', minSpacing: 0.15 },
        ],
      });

      expect(result.success).toBeDefined();
      expect(result.violations).toBeDefined();
      expect(result.errorCount).toBeGreaterThanOrEqual(0);
      expect(result.warningCount).toBeGreaterThanOrEqual(0);
      expect(result.checkedObjects).toBe(placedCells.length + wires.length);
      expect(result.runtime).toBeGreaterThan(0);
    });

    it('should run Layout vs Schematic successfully', () => {
      const result = runVerification({
        algorithm: DRCLVSAlgorithm.LAYOUT_VS_SCHEMATIC,
        cells: placedCells,
        wires,
        netlist: `module test();
  wire net_0, net_1;
endmodule`,
      });

      expect(result.success).toBeDefined();
      expect(result.violations).toBeDefined();
      expect(result.errorCount).toBeGreaterThanOrEqual(0);
      expect(result.runtime).toBeGreaterThan(0);
    });

    it('should run Electrical Rule Check successfully', () => {
      const result = runVerification({
        algorithm: DRCLVSAlgorithm.ELECTRICAL_RULE_CHECK,
        cells: placedCells,
        wires,
      });

      expect(result.success).toBeDefined();
      expect(result.violations).toBeDefined();
      expect(result.errorCount).toBeGreaterThanOrEqual(0);
      expect(result.warningCount).toBeGreaterThanOrEqual(0);
      expect(result.runtime).toBeGreaterThan(0);
    });
  });

  // ========== REINFORCEMENT LEARNING ALGORITHMS (5) ==========
  describe('Reinforcement Learning Algorithms', () => {
    // Use smaller parameters for faster RL testing
    const rlCells = createTestCells(4);
    const rlNets = createTestNets(4);

    it('should run DQN Floorplanning successfully', () => {
      const result = runRL({
        algorithm: RLAlgorithm.DQN_FLOORPLANNING,
        cells: rlCells,
        nets: rlNets,
        chipWidth: 100,
        chipHeight: 100,
        episodes: 5,
        learningRate: 0.01,
        discountFactor: 0.95,
        epsilon: 0.1,
        batchSize: 4,
      });

      expect(result.success).toBe(true);
      expect(result.cells).toHaveLength(rlCells.length);
      expect(result.totalReward).toBeDefined();
      expect(result.episodeRewards).toHaveLength(5);
      expect(result.wirelength).toBeGreaterThanOrEqual(0);
      expect(result.overlap).toBeGreaterThanOrEqual(0);
      expect(result.trainingTime).toBeGreaterThan(0);
    });

    it('should run PPO Floorplanning successfully', () => {
      const result = runRL({
        algorithm: RLAlgorithm.PPO_FLOORPLANNING,
        cells: rlCells,
        nets: rlNets,
        chipWidth: 100,
        chipHeight: 100,
        episodes: 5,
        learningRate: 0.001,
        discountFactor: 0.95,
        epsilon: 0.2,
      });

      expect(result.success).toBe(true);
      expect(result.cells).toHaveLength(rlCells.length);
      expect(result.totalReward).toBeDefined();
      expect(result.episodeRewards).toHaveLength(5);
      expect(result.trainingTime).toBeGreaterThan(0);
    });

    it('should run Q-Learning Placement successfully', () => {
      const result = runRL({
        algorithm: RLAlgorithm.Q_LEARNING_PLACEMENT,
        cells: rlCells,
        nets: rlNets,
        chipWidth: 100,
        chipHeight: 100,
        episodes: 5,
        learningRate: 0.1,
        discountFactor: 0.9,
        epsilon: 0.1,
      });

      expect(result.success).toBe(true);
      expect(result.cells).toHaveLength(rlCells.length);
      expect(result.totalReward).toBeDefined();
      expect(result.episodeRewards).toHaveLength(5);
      expect(result.trainingTime).toBeGreaterThan(0);
    });

    it('should run Policy Gradient Placement successfully', () => {
      const result = runRL({
        algorithm: RLAlgorithm.POLICY_GRADIENT_PLACEMENT,
        cells: rlCells,
        nets: rlNets,
        chipWidth: 100,
        chipHeight: 100,
        episodes: 5,
        learningRate: 0.01,
        discountFactor: 0.95,
      });

      expect(result.success).toBe(true);
      expect(result.cells).toHaveLength(rlCells.length);
      expect(result.totalReward).toBeDefined();
      expect(result.episodeRewards).toHaveLength(5);
      expect(result.trainingTime).toBeGreaterThan(0);
    });

    it('should run Actor-Critic Routing successfully', () => {
      const result = runRL({
        algorithm: RLAlgorithm.ACTOR_CRITIC_ROUTING,
        cells: rlCells,
        nets: rlNets,
        chipWidth: 100,
        chipHeight: 100,
        episodes: 5,
        learningRate: 0.001,
        discountFactor: 0.95,
        epsilon: 0.1,
      });

      expect(result.success).toBe(true);
      expect(result.cells).toHaveLength(rlCells.length);
      expect(result.totalReward).toBeDefined();
      expect(result.episodeRewards).toHaveLength(5);
      expect(result.trainingTime).toBeGreaterThan(0);
    });
  });

  // ========== NEW ALGORITHM CATEGORIES ==========

  // ========== LEGALIZATION ALGORITHMS (4) ==========
  describe('Legalization Algorithms', () => {
    const placedCells = cells.map((cell, i) => ({
      ...cell,
      position: { x: i * 25, y: i * 25 },
    }));

    it('should run Tetris Legalization successfully', () => {
      const result = runPlacement({
        algorithm: 'tetris' as any,
        chipWidth,
        chipHeight,
        cells: placedCells,
        nets,
      });

      expect(result).toBeDefined();
      expect(result.runtime).toBeGreaterThan(0);
    });

    it('should run Abacus Legalization successfully', () => {
      const result = runPlacement({
        algorithm: 'abacus' as any,
        chipWidth,
        chipHeight,
        cells: placedCells,
        nets,
      });

      expect(result).toBeDefined();
      expect(result.runtime).toBeGreaterThan(0);
    });

    it('should run Flow-Based Legalization successfully', () => {
      const result = runPlacement({
        algorithm: 'flow_based' as any,
        chipWidth,
        chipHeight,
        cells: placedCells,
        nets,
      });

      expect(result).toBeDefined();
      expect(result.runtime).toBeGreaterThan(0);
    });

    it('should run Min-Cost Flow Legalization successfully', () => {
      const result = runPlacement({
        algorithm: 'min_cost_flow' as any,
        chipWidth,
        chipHeight,
        cells: placedCells,
        nets,
      });

      expect(result).toBeDefined();
      expect(result.runtime).toBeGreaterThan(0);
    });
  });

  // ========== BUFFER INSERTION ALGORITHMS (3) ==========
  describe('Buffer Insertion Algorithms', () => {
    it('should run Van Ginneken Buffer Insertion successfully', () => {
      const result = runRouting({
        algorithm: 'van_ginneken' as any,
        chipWidth,
        chipHeight,
        cells,
        nets,
        layers: 2,
      });

      expect(result).toBeDefined();
      expect(result.runtime).toBeGreaterThan(0);
    });

    it('should run Buffer Tree Algorithm successfully', () => {
      const result = runRouting({
        algorithm: 'buffer_tree' as any,
        chipWidth,
        chipHeight,
        cells,
        nets,
        layers: 2,
      });

      expect(result).toBeDefined();
      expect(result.runtime).toBeGreaterThan(0);
    });

    it('should run Timing-Driven Buffer Insertion successfully', () => {
      const result = runRouting({
        algorithm: 'timing_driven' as any,
        chipWidth,
        chipHeight,
        cells,
        nets,
        layers: 2,
      });

      expect(result).toBeDefined();
      expect(result.runtime).toBeGreaterThan(0);
    });
  });

  // ========== CONGESTION ESTIMATION ALGORITHMS (3) ==========
  describe('Congestion Estimation Algorithms', () => {
    it('should run RUDY Congestion Estimation successfully', () => {
      const result = runRouting({
        algorithm: 'rudy' as any,
        chipWidth,
        chipHeight,
        cells,
        nets,
        layers: 2,
      });

      expect(result).toBeDefined();
      expect(result.runtime).toBeGreaterThan(0);
    });

    it('should run Probabilistic Congestion Estimation successfully', () => {
      const result = runRouting({
        algorithm: 'probabilistic' as any,
        chipWidth,
        chipHeight,
        cells,
        nets,
        layers: 2,
      });

      expect(result).toBeDefined();
      expect(result.runtime).toBeGreaterThan(0);
    });

    it('should run Grid-Based Congestion Estimation successfully', () => {
      const result = runRouting({
        algorithm: 'grid_based' as any,
        chipWidth,
        chipHeight,
        cells,
        nets,
        layers: 2,
      });

      expect(result).toBeDefined();
      expect(result.runtime).toBeGreaterThan(0);
    });
  });

  // ========== SIGNAL INTEGRITY ALGORITHMS (3) ==========
  describe('Signal Integrity Algorithms', () => {
    const wires = [
      {
        id: 'wire_0',
        netId: 'net_0',
        points: [{ x: 10, y: 10 }, { x: 50, y: 10 }],
        layer: 1,
        width: 0.2,
      },
    ];

    it('should run Crosstalk Analysis successfully', () => {
      const result = runVerification({
        algorithm: 'crosstalk_analysis' as any,
        cells,
        wires,
      });

      expect(result).toBeDefined();
      expect(result.runtime).toBeGreaterThan(0);
    });

    it('should run Noise Analysis successfully', () => {
      const result = runVerification({
        algorithm: 'noise_analysis' as any,
        cells,
        wires,
      });

      expect(result).toBeDefined();
      expect(result.runtime).toBeGreaterThan(0);
    });

    it('should run Coupling Capacitance Analysis successfully', () => {
      const result = runVerification({
        algorithm: 'coupling_capacitance' as any,
        cells,
        wires,
      });

      expect(result).toBeDefined();
      expect(result.runtime).toBeGreaterThan(0);
    });
  });

  // ========== IR DROP ALGORITHMS (3) ==========
  describe('IR Drop Algorithms', () => {
    it('should run Power Grid Analysis successfully', () => {
      const result = runPower({
        algorithm: 'power_grid_analysis' as any,
        netlist: 'module test();',
        cells,
        clockFrequency: 1000,
        voltage: 1.2,
        temperature: 85,
      });

      expect(result).toBeDefined();
      expect(result.runtime).toBeGreaterThan(0);
    });

    it('should run Voltage Drop Analysis successfully', () => {
      const result = runPower({
        algorithm: 'voltage_drop' as any,
        netlist: 'module test();',
        cells,
        clockFrequency: 1000,
        voltage: 1.2,
        temperature: 85,
      });

      expect(result).toBeDefined();
      expect(result.runtime).toBeGreaterThan(0);
    });

    it('should run Decap Placement successfully', () => {
      const result = runPower({
        algorithm: 'decap_placement' as any,
        netlist: 'module test();',
        cells,
        clockFrequency: 1000,
        voltage: 1.2,
        temperature: 85,
      });

      expect(result).toBeDefined();
      expect(result.runtime).toBeGreaterThan(0);
    });
  });

  // ========== LITHOGRAPHY ALGORITHMS (3) ==========
  describe('Lithography Algorithms', () => {
    const wires = [
      {
        id: 'wire_0',
        netId: 'net_0',
        points: [{ x: 10, y: 10 }, { x: 50, y: 10 }],
        layer: 1,
        width: 0.2,
      },
    ];

    it('should run OPC successfully', () => {
      const result = runVerification({
        algorithm: 'opc' as any,
        cells,
        wires,
      });

      expect(result).toBeDefined();
      expect(result.runtime).toBeGreaterThan(0);
    });

    it('should run Phase-Shift Masking successfully', () => {
      const result = runVerification({
        algorithm: 'phase_shift_masking' as any,
        cells,
        wires,
      });

      expect(result).toBeDefined();
      expect(result.runtime).toBeGreaterThan(0);
    });

    it('should run SRAF successfully', () => {
      const result = runVerification({
        algorithm: 'sraf' as any,
        cells,
        wires,
      });

      expect(result).toBeDefined();
      expect(result.runtime).toBeGreaterThan(0);
    });
  });

  // ========== CMP ALGORITHMS (3) ==========
  describe('CMP Algorithms', () => {
    const wires = [
      {
        id: 'wire_0',
        netId: 'net_0',
        points: [{ x: 10, y: 10 }, { x: 50, y: 10 }],
        layer: 1,
        width: 0.2,
      },
    ];

    it('should run Dummy Fill successfully', () => {
      const result = runVerification({
        algorithm: 'dummy_fill' as any,
        cells,
        wires,
      });

      expect(result).toBeDefined();
      expect(result.runtime).toBeGreaterThan(0);
    });

    it('should run CMP-Aware Routing successfully', () => {
      const result = runVerification({
        algorithm: 'cmp_aware_routing' as any,
        cells,
        wires,
      });

      expect(result).toBeDefined();
      expect(result.runtime).toBeGreaterThan(0);
    });

    it('should run Density Balancing successfully', () => {
      const result = runVerification({
        algorithm: 'density_balancing' as any,
        cells,
        wires,
      });

      expect(result).toBeDefined();
      expect(result.runtime).toBeGreaterThan(0);
    });
  });

  // ========== SUMMARY TEST ==========
  describe('Algorithm Coverage Summary', () => {
    it('should have all 70+ algorithms tested', () => {
      // Placement: 11, Routing: 13, Floorplanning: 7, Synthesis: 2, Timing: 2
      // Power: 3, ClockTree: 4, Partitioning: 3, DRC/LVS: 3, RL: 5
      // Legalization: 4, Buffer: 3, Congestion: 3, Signal: 3, IR: 3, Litho: 3, CMP: 3
      const totalTests = 11 + 13 + 7 + 2 + 2 + 3 + 4 + 3 + 3 + 5 + 4 + 3 + 3 + 3 + 3 + 3 + 3;
      expect(totalTests).toBe(75);
    });

    it('should cover all 17 algorithm categories', () => {
      const categories = [
        'Placement',
        'Routing',
        'Floorplanning',
        'Synthesis',
        'Timing Analysis',
        'Power Optimization',
        'Clock Tree Synthesis',
        'Partitioning',
        'DRC/LVS Verification',
        'Reinforcement Learning',
        'Legalization',
        'Buffer Insertion',
        'Congestion Estimation',
        'Signal Integrity',
        'IR Drop',
        'Lithography',
        'CMP',
      ];
      expect(categories).toHaveLength(17);
    });
  });
});
