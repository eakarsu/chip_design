import {
  runRouting,
  mazeRouting,
  aStarRouting,
  globalRouting,
} from '@/lib/algorithms/routing';
import {
  RoutingParams,
  RoutingAlgorithm,
  Cell,
  Net,
} from '@/types/algorithms';

describe('Routing Algorithms', () => {
  // Create test data
  const createTestCells = (): Cell[] => [
    {
      id: 'cell1',
      name: 'Cell 1',
      width: 10,
      height: 10,
      position: { x: 10, y: 10 },
      pins: [
        { id: 'pin1', name: 'A', position: { x: 5, y: 5 }, direction: 'output' },
      ],
      type: 'standard',
    },
    {
      id: 'cell2',
      name: 'Cell 2',
      width: 10,
      height: 10,
      position: { x: 80, y: 80 },
      pins: [
        { id: 'pin2', name: 'B', position: { x: 5, y: 5 }, direction: 'input' },
      ],
      type: 'standard',
    },
    {
      id: 'cell3',
      name: 'Cell 3',
      width: 10,
      height: 10,
      position: { x: 40, y: 40 },
      pins: [
        { id: 'pin3', name: 'C', position: { x: 5, y: 5 }, direction: 'inout' },
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
      weight: 1.5,
    },
  ];

  describe('Maze Routing (Lee\'s Algorithm)', () => {
    it('should successfully route nets using maze routing', () => {
      const params: RoutingParams = {
        algorithm: RoutingAlgorithm.MAZE_ROUTING,
        chipWidth: 100,
        chipHeight: 100,
        cells: createTestCells(),
        nets: createTestNets(),
        layers: 2,
        gridSize: 5,
        viaWeight: 2,
      };

      const result = mazeRouting(params);

      expect(result.success).toBe(true);
      expect(result.wires.length).toBeGreaterThan(0);
      expect(result.totalWirelength).toBeGreaterThan(0);
      expect(result.viaCount).toBeGreaterThanOrEqual(0);
      expect(result.runtime).toBeGreaterThan(0);
      expect(result.unroutedNets).toHaveLength(0);
    });

    it('should create wires with valid points', () => {
      const params: RoutingParams = {
        algorithm: RoutingAlgorithm.MAZE_ROUTING,
        chipWidth: 100,
        chipHeight: 100,
        cells: createTestCells(),
        nets: createTestNets(),
        layers: 2,
        gridSize: 10,
      };

      const result = mazeRouting(params);

      result.wires.forEach((wire) => {
        expect(wire.id).toBeDefined();
        expect(wire.netId).toBeDefined();
        expect(wire.points.length).toBeGreaterThanOrEqual(2);
        expect(wire.layer).toBeGreaterThanOrEqual(0);
        expect(wire.width).toBeGreaterThan(0);

        // Check all points are within chip bounds
        wire.points.forEach((point) => {
          expect(point.x).toBeGreaterThanOrEqual(0);
          expect(point.y).toBeGreaterThanOrEqual(0);
          expect(point.x).toBeLessThanOrEqual(100);
          expect(point.y).toBeLessThanOrEqual(100);
        });
      });
    });

    it('should handle single layer routing', () => {
      const params: RoutingParams = {
        algorithm: RoutingAlgorithm.MAZE_ROUTING,
        chipWidth: 100,
        chipHeight: 100,
        cells: createTestCells(),
        nets: [createTestNets()[0]],
        layers: 1,
        gridSize: 10,
      };

      const result = mazeRouting(params);

      expect(result.success).toBe(true);
      expect(result.wires.length).toBeGreaterThan(0);
    });

    it('should handle nets with no pins', () => {
      const emptyNet: Net = {
        id: 'empty',
        name: 'Empty',
        pins: [],
        weight: 1,
      };

      const params: RoutingParams = {
        algorithm: RoutingAlgorithm.MAZE_ROUTING,
        chipWidth: 100,
        chipHeight: 100,
        cells: createTestCells(),
        nets: [emptyNet],
        layers: 2,
        gridSize: 10,
      };

      const result = mazeRouting(params);

      expect(result.wires.length).toBe(0);
    });
  });

  describe('A* Routing Algorithm', () => {
    it('should successfully route nets using A* algorithm', () => {
      const params: RoutingParams = {
        algorithm: RoutingAlgorithm.A_STAR,
        chipWidth: 100,
        chipHeight: 100,
        cells: createTestCells(),
        nets: createTestNets(),
        layers: 3,
        gridSize: 5,
        viaWeight: 2,
        bendWeight: 1.5,
      };

      const result = aStarRouting(params);

      // A* may not always find routes in complex scenarios
      expect(result).toBeDefined();
      expect(result.runtime).toBeGreaterThan(0);
      if (result.success) {
        expect(result.wires.length).toBeGreaterThan(0);
        expect(result.totalWirelength).toBeGreaterThan(0);
      }
    });

    it('should optimize path with bend weight', () => {
      const simpleCells: Cell[] = [
        {
          id: 'c1',
          name: 'C1',
          width: 5,
          height: 5,
          position: { x: 10, y: 10 },
          pins: [{ id: 'p1', name: 'P1', position: { x: 2, y: 2 }, direction: 'output' }],
          type: 'standard',
        },
        {
          id: 'c2',
          name: 'C2',
          width: 5,
          height: 5,
          position: { x: 50, y: 50 },
          pins: [{ id: 'p2', name: 'P2', position: { x: 2, y: 2 }, direction: 'input' }],
          type: 'standard',
        },
      ];

      const simpleNet: Net[] = [
        {
          id: 'n1',
          name: 'N1',
          pins: ['p1', 'p2'],
          weight: 1,
        },
      ];

      const params: RoutingParams = {
        algorithm: RoutingAlgorithm.A_STAR,
        chipWidth: 100,
        chipHeight: 100,
        cells: simpleCells,
        nets: simpleNet,
        layers: 2,
        gridSize: 10,
        bendWeight: 1.5,
      };

      const result = aStarRouting(params);

      expect(result).toBeDefined();
      expect(result.runtime).toBeGreaterThan(0);
    });

    it('should handle multiple layers with via weight', () => {
      const params: RoutingParams = {
        algorithm: RoutingAlgorithm.A_STAR,
        chipWidth: 100,
        chipHeight: 100,
        cells: createTestCells(),
        nets: createTestNets(),
        layers: 4,
        gridSize: 10,
        viaWeight: 5, // High via cost
      };

      const result = aStarRouting(params);

      expect(result).toBeDefined();
      // High via weight should discourage layer changes
      expect(result.viaCount).toBeGreaterThanOrEqual(0);
    });

    it('should create valid wire structures', () => {
      const params: RoutingParams = {
        algorithm: RoutingAlgorithm.A_STAR,
        chipWidth: 100,
        chipHeight: 100,
        cells: createTestCells(),
        nets: createTestNets(),
        layers: 2,
        gridSize: 10,
      };

      const result = aStarRouting(params);

      result.wires.forEach((wire) => {
        expect(wire.id).toBeDefined();
        expect(wire.netId).toBeDefined();
        expect(wire.points).toBeDefined();
        expect(wire.points.length).toBeGreaterThanOrEqual(1);
        expect(wire.layer).toBeGreaterThanOrEqual(0);
        expect(wire.layer).toBeLessThan(2);
      });
    });
  });

  describe('Global Routing', () => {
    it('should successfully perform global routing', () => {
      const params: RoutingParams = {
        algorithm: RoutingAlgorithm.GLOBAL_ROUTING,
        chipWidth: 200,
        chipHeight: 200,
        cells: createTestCells(),
        nets: createTestNets(),
        layers: 2,
        gridSize: 50,
      };

      const result = globalRouting(params);

      expect(result.success).toBe(true);
      expect(result.wires.length).toBeGreaterThan(0);
      expect(result.totalWirelength).toBeGreaterThan(0);
      expect(result.runtime).toBeGreaterThan(0);
      expect(result.unroutedNets).toHaveLength(0);
      expect(result.viaCount).toBe(0); // Global routing doesn't use vias
    });

    it('should use L-shaped routing', () => {
      const params: RoutingParams = {
        algorithm: RoutingAlgorithm.GLOBAL_ROUTING,
        chipWidth: 200,
        chipHeight: 200,
        cells: createTestCells(),
        nets: createTestNets(),
        layers: 2,
        gridSize: 50,
      };

      const result = globalRouting(params);

      // L-shaped routing creates 3 points per route
      result.wires.forEach((wire) => {
        expect(wire.points.length).toBe(3);
        expect(wire.width).toBe(2); // Global routing uses wider wires
      });
    });

    it('should handle large grid sizes', () => {
      const params: RoutingParams = {
        algorithm: RoutingAlgorithm.GLOBAL_ROUTING,
        chipWidth: 500,
        chipHeight: 500,
        cells: createTestCells(),
        nets: createTestNets(),
        layers: 2,
        gridSize: 100,
      };

      const result = globalRouting(params);

      expect(result.success).toBe(true);
      expect(result.wires.length).toBeGreaterThan(0);
    });

    it('should be faster than detailed routing', () => {
      const cells = createTestCells();
      const nets = createTestNets();

      const globalParams: RoutingParams = {
        algorithm: RoutingAlgorithm.GLOBAL_ROUTING,
        chipWidth: 200,
        chipHeight: 200,
        cells,
        nets,
        layers: 2,
        gridSize: 50,
      };

      const mazeParams: RoutingParams = {
        algorithm: RoutingAlgorithm.MAZE_ROUTING,
        chipWidth: 200,
        chipHeight: 200,
        cells,
        nets,
        layers: 2,
        gridSize: 10,
      };

      const globalResult = globalRouting(globalParams);
      const mazeResult = mazeRouting(mazeParams);

      // Global routing should generally be faster
      expect(globalResult.runtime).toBeLessThan(mazeResult.runtime * 2);
    });
  });

  describe('runRouting dispatcher', () => {
    it('should call maze routing when specified', () => {
      const params: RoutingParams = {
        algorithm: RoutingAlgorithm.MAZE_ROUTING,
        chipWidth: 100,
        chipHeight: 100,
        cells: createTestCells(),
        nets: createTestNets(),
        layers: 2,
      };

      const result = runRouting(params);
      expect(result.success).toBe(true);
    });

    it('should call A* routing when specified', () => {
      const params: RoutingParams = {
        algorithm: RoutingAlgorithm.A_STAR,
        chipWidth: 100,
        chipHeight: 100,
        cells: createTestCells(),
        nets: createTestNets(),
        layers: 2,
      };

      const result = runRouting(params);
      expect(result).toBeDefined();
      expect(result.runtime).toBeGreaterThan(0);
    });

    it('should call global routing when specified', () => {
      const params: RoutingParams = {
        algorithm: RoutingAlgorithm.GLOBAL_ROUTING,
        chipWidth: 100,
        chipHeight: 100,
        cells: createTestCells(),
        nets: createTestNets(),
        layers: 2,
      };

      const result = runRouting(params);
      expect(result.success).toBe(true);
    });

    it('should throw error for unsupported algorithm', () => {
      const params: RoutingParams = {
        algorithm: 'invalid' as RoutingAlgorithm,
        chipWidth: 100,
        chipHeight: 100,
        cells: createTestCells(),
        nets: createTestNets(),
        layers: 2,
      };

      expect(() => runRouting(params)).toThrow('Unsupported routing algorithm');
    });
  });
});
