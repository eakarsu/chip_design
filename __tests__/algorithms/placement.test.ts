import {
  runPlacement,
  simulatedAnnealingPlacement,
  geneticPlacement,
  forceDirectedPlacement,
} from '@/lib/algorithms/placement';
import {
  PlacementParams,
  PlacementAlgorithm,
  Cell,
  Net,
} from '@/types/algorithms';

describe('Placement Algorithms', () => {
  // Create test data
  const createTestCells = (): Cell[] => [
    {
      id: 'cell1',
      name: 'Cell 1',
      width: 10,
      height: 10,
      pins: [
        { id: 'pin1', name: 'A', position: { x: 5, y: 5 }, direction: 'input' },
      ],
      type: 'standard',
    },
    {
      id: 'cell2',
      name: 'Cell 2',
      width: 15,
      height: 15,
      pins: [
        { id: 'pin2', name: 'B', position: { x: 7, y: 7 }, direction: 'output' },
      ],
      type: 'standard',
    },
    {
      id: 'cell3',
      name: 'Cell 3',
      width: 12,
      height: 12,
      pins: [
        { id: 'pin3', name: 'C', position: { x: 6, y: 6 }, direction: 'input' },
      ],
      type: 'standard',
    },
    {
      id: 'cell4',
      name: 'Cell 4',
      width: 8,
      height: 8,
      pins: [
        { id: 'pin4', name: 'D', position: { x: 4, y: 4 }, direction: 'output' },
      ],
      type: 'standard',
    },
  ];

  const createTestNets = (): Net[] => [
    {
      id: 'net1',
      name: 'Net 1',
      pins: ['pin1', 'pin2'],
      weight: 1,
    },
    {
      id: 'net2',
      name: 'Net 2',
      pins: ['pin2', 'pin3'],
      weight: 2,
    },
    {
      id: 'net3',
      name: 'Net 3',
      pins: ['pin3', 'pin4'],
      weight: 1.5,
    },
  ];

  describe('Simulated Annealing Placement', () => {
    it('should successfully place cells on chip', () => {
      const params: PlacementParams = {
        algorithm: PlacementAlgorithm.SIMULATED_ANNEALING,
        chipWidth: 100,
        chipHeight: 100,
        cells: createTestCells(),
        nets: createTestNets(),
        iterations: 100,
        temperature: 1000,
        coolingRate: 0.95,
      };

      const result = simulatedAnnealingPlacement(params);

      expect(result.success).toBe(true);
      expect(result.cells).toHaveLength(4);
      expect(result.totalWirelength).toBeGreaterThan(0);
      expect(result.overlap).toBeGreaterThanOrEqual(0);
      expect(result.runtime).toBeGreaterThan(0);
      expect(result.iterations).toBe(100);
      expect(result.convergenceData).toBeDefined();
      expect(result.convergenceData?.length).toBe(100);

      // Check all cells have positions
      result.cells.forEach((cell) => {
        expect(cell.position).toBeDefined();
        expect(cell.position!.x).toBeGreaterThanOrEqual(0);
        expect(cell.position!.y).toBeGreaterThanOrEqual(0);
        expect(cell.position!.x + cell.width).toBeLessThanOrEqual(100);
        expect(cell.position!.y + cell.height).toBeLessThanOrEqual(100);
      });
    });

    it('should minimize wirelength over iterations', () => {
      const params: PlacementParams = {
        algorithm: PlacementAlgorithm.SIMULATED_ANNEALING,
        chipWidth: 100,
        chipHeight: 100,
        cells: createTestCells(),
        nets: createTestNets(),
        iterations: 200,
      };

      const result = simulatedAnnealingPlacement(params);
      const convergenceData = result.convergenceData!;

      // Check that wirelength generally decreases
      const firstQuarter = convergenceData.slice(0, 50);
      const lastQuarter = convergenceData.slice(-50);
      const avgFirst = firstQuarter.reduce((a, b) => a + b, 0) / firstQuarter.length;
      const avgLast = lastQuarter.reduce((a, b) => a + b, 0) / lastQuarter.length;

      expect(avgLast).toBeLessThan(avgFirst * 1.1); // Allow 10% margin
    });

    it('should handle edge cases - single cell', () => {
      const params: PlacementParams = {
        algorithm: PlacementAlgorithm.SIMULATED_ANNEALING,
        chipWidth: 50,
        chipHeight: 50,
        cells: [createTestCells()[0]],
        nets: [],
        iterations: 10,
      };

      const result = simulatedAnnealingPlacement(params);

      expect(result.success).toBe(true);
      expect(result.cells).toHaveLength(1);
      expect(result.totalWirelength).toBe(0);
    });
  });

  describe('Genetic Algorithm Placement', () => {
    it('should successfully place cells using genetic algorithm', () => {
      const params: PlacementParams = {
        algorithm: PlacementAlgorithm.GENETIC,
        chipWidth: 100,
        chipHeight: 100,
        cells: createTestCells(),
        nets: createTestNets(),
        iterations: 50,
        populationSize: 20,
        mutationRate: 0.1,
      };

      const result = geneticPlacement(params);

      expect(result.success).toBe(true);
      expect(result.cells).toHaveLength(4);
      expect(result.totalWirelength).toBeGreaterThan(0);
      expect(result.runtime).toBeGreaterThan(0);
      expect(result.iterations).toBe(50);
      expect(result.convergenceData).toHaveLength(50);

      // Check all cells have valid positions
      result.cells.forEach((cell) => {
        expect(cell.position).toBeDefined();
        expect(cell.position!.x).toBeGreaterThanOrEqual(0);
        expect(cell.position!.y).toBeGreaterThanOrEqual(0);
      });
    });

    it('should evolve population to minimize wirelength', () => {
      const params: PlacementParams = {
        algorithm: PlacementAlgorithm.GENETIC,
        chipWidth: 100,
        chipHeight: 100,
        cells: createTestCells(),
        nets: createTestNets(),
        iterations: 100,
        populationSize: 30,
        mutationRate: 0.15,
      };

      const result = geneticPlacement(params);
      const convergenceData = result.convergenceData!;

      // Best fitness should improve or stay same (never worse)
      for (let i = 1; i < convergenceData.length; i++) {
        expect(convergenceData[i]).toBeLessThanOrEqual(convergenceData[i - 1] * 1.01);
      }
    });

    it('should handle different population sizes', () => {
      const smallPop: PlacementParams = {
        algorithm: PlacementAlgorithm.GENETIC,
        chipWidth: 100,
        chipHeight: 100,
        cells: createTestCells(),
        nets: createTestNets(),
        iterations: 20,
        populationSize: 10,
        mutationRate: 0.1,
      };

      const result = geneticPlacement(smallPop);
      expect(result.success).toBe(true);
      expect(result.cells).toHaveLength(4);
    });
  });

  describe('Force-Directed Placement', () => {
    it('should successfully place cells using force-directed algorithm', () => {
      const params: PlacementParams = {
        algorithm: PlacementAlgorithm.FORCE_DIRECTED,
        chipWidth: 100,
        chipHeight: 100,
        cells: createTestCells(),
        nets: createTestNets(),
        iterations: 100,
      };

      const result = forceDirectedPlacement(params);

      expect(result.success).toBe(true);
      expect(result.cells).toHaveLength(4);
      expect(result.totalWirelength).toBeGreaterThan(0);
      expect(result.runtime).toBeGreaterThan(0);
      expect(result.convergenceData).toHaveLength(100);

      // Check all cells have positions within bounds
      result.cells.forEach((cell) => {
        expect(cell.position).toBeDefined();
        expect(cell.position!.x).toBeGreaterThanOrEqual(0);
        expect(cell.position!.y).toBeGreaterThanOrEqual(0);
        expect(cell.position!.x + cell.width).toBeLessThanOrEqual(100);
        expect(cell.position!.y + cell.height).toBeLessThanOrEqual(100);
      });
    });

    it('should place connected cells closer together', () => {
      // Create a simple two-cell scenario with one net
      const simpleCells: Cell[] = [
        {
          id: 'c1',
          name: 'C1',
          width: 10,
          height: 10,
          pins: [{ id: 'p1', name: 'P1', position: { x: 5, y: 5 }, direction: 'output' }],
          type: 'standard',
        },
        {
          id: 'c2',
          name: 'C2',
          width: 10,
          height: 10,
          pins: [{ id: 'p2', name: 'P2', position: { x: 5, y: 5 }, direction: 'input' }],
          type: 'standard',
        },
      ];

      const simpleNet: Net[] = [
        {
          id: 'n1',
          name: 'N1',
          pins: ['p1', 'p2'],
          weight: 10, // High weight
        },
      ];

      const params: PlacementParams = {
        algorithm: PlacementAlgorithm.FORCE_DIRECTED,
        chipWidth: 200,
        chipHeight: 200,
        cells: simpleCells,
        nets: simpleNet,
        iterations: 500,
      };

      const result = forceDirectedPlacement(params);

      expect(result.success).toBe(true);
      // Connected cells should be relatively close (allowing for algorithm variance)
      expect(result.totalWirelength).toBeLessThan(1000);
    });

    it('should converge over iterations', () => {
      const params: PlacementParams = {
        algorithm: PlacementAlgorithm.FORCE_DIRECTED,
        chipWidth: 100,
        chipHeight: 100,
        cells: createTestCells(),
        nets: createTestNets(),
        iterations: 200,
      };

      const result = forceDirectedPlacement(params);
      const convergenceData = result.convergenceData!;

      // Wirelength should stabilize (last 20% should have less variance than first 20%)
      const firstPart = convergenceData.slice(0, 40);
      const lastPart = convergenceData.slice(-40);

      const variance = (arr: number[]) => {
        const mean = arr.reduce((a, b) => a + b) / arr.length;
        return arr.reduce((sum, val) => sum + (val - mean) ** 2, 0) / arr.length;
      };

      expect(variance(lastPart)).toBeLessThanOrEqual(variance(firstPart));
    });
  });

  describe('runPlacement dispatcher', () => {
    it('should call simulated annealing when specified', () => {
      const params: PlacementParams = {
        algorithm: PlacementAlgorithm.SIMULATED_ANNEALING,
        chipWidth: 100,
        chipHeight: 100,
        cells: createTestCells(),
        nets: createTestNets(),
        iterations: 50,
      };

      const result = runPlacement(params);
      expect(result.success).toBe(true);
      expect(result.iterations).toBe(50);
    });

    it('should call genetic algorithm when specified', () => {
      const params: PlacementParams = {
        algorithm: PlacementAlgorithm.GENETIC,
        chipWidth: 100,
        chipHeight: 100,
        cells: createTestCells(),
        nets: createTestNets(),
        iterations: 30,
        populationSize: 20,
      };

      const result = runPlacement(params);
      expect(result.success).toBe(true);
      expect(result.iterations).toBe(30);
    });

    it('should call force-directed when specified', () => {
      const params: PlacementParams = {
        algorithm: PlacementAlgorithm.FORCE_DIRECTED,
        chipWidth: 100,
        chipHeight: 100,
        cells: createTestCells(),
        nets: createTestNets(),
        iterations: 100,
      };

      const result = runPlacement(params);
      expect(result.success).toBe(true);
      expect(result.iterations).toBe(100);
    });

    it('should throw error for unsupported algorithm', () => {
      const params: PlacementParams = {
        algorithm: 'unsupported' as PlacementAlgorithm,
        chipWidth: 100,
        chipHeight: 100,
        cells: createTestCells(),
        nets: createTestNets(),
      };

      expect(() => runPlacement(params)).toThrow('Unsupported placement algorithm');
    });
  });
});
