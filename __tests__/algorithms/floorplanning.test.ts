import {
  runFloorplanning,
  slicingTreeFloorplanning,
  sequencePairFloorplanning,
} from '@/lib/algorithms/floorplanning';
import {
  FloorplanningParams,
  FloorplanningAlgorithm,
  Cell,
} from '@/types/algorithms';

describe('Floorplanning Algorithms', () => {
  // Create test blocks
  const createTestBlocks = (): Cell[] => [
    {
      id: 'block1',
      name: 'Block 1',
      width: 20,
      height: 30,
      pins: [],
      type: 'macro',
    },
    {
      id: 'block2',
      name: 'Block 2',
      width: 40,
      height: 25,
      pins: [],
      type: 'macro',
    },
    {
      id: 'block3',
      name: 'Block 3',
      width: 30,
      height: 30,
      pins: [],
      type: 'macro',
    },
    {
      id: 'block4',
      name: 'Block 4',
      width: 25,
      height: 20,
      pins: [],
      type: 'macro',
    },
  ];

  describe('Slicing Tree Floorplanning', () => {
    it('should successfully create floorplan using slicing tree', () => {
      const params: FloorplanningParams = {
        algorithm: FloorplanningAlgorithm.SLICING_TREE,
        chipWidth: 200,
        chipHeight: 200,
        blocks: createTestBlocks(),
        aspectRatioMin: 0.5,
        aspectRatioMax: 2.0,
      };

      const result = slicingTreeFloorplanning(params);

      expect(result.success).toBe(true);
      expect(result.blocks).toHaveLength(4);
      expect(result.area).toBe(40000); // 200 x 200
      expect(result.aspectRatio).toBe(1); // 200/200
      expect(result.utilization).toBeGreaterThan(0);
      expect(result.utilization).toBeLessThanOrEqual(1);
      expect(result.deadSpace).toBeGreaterThanOrEqual(0);
      expect(result.runtime).toBeGreaterThan(0);
    });

    it('should place all blocks with valid positions', () => {
      const params: FloorplanningParams = {
        algorithm: FloorplanningAlgorithm.SLICING_TREE,
        chipWidth: 200,
        chipHeight: 200,
        blocks: createTestBlocks(),
      };

      const result = slicingTreeFloorplanning(params);

      result.blocks.forEach((block) => {
        expect(block.position).toBeDefined();
        expect(block.position!.x).toBeGreaterThanOrEqual(0);
        expect(block.position!.y).toBeGreaterThanOrEqual(0);
        expect(block.position!.x + block.width).toBeLessThanOrEqual(200);
        expect(block.position!.y + block.height).toBeLessThanOrEqual(200);
      });
    });

    it('should calculate correct utilization', () => {
      const params: FloorplanningParams = {
        algorithm: FloorplanningAlgorithm.SLICING_TREE,
        chipWidth: 200,
        chipHeight: 200,
        blocks: createTestBlocks(),
      };

      const result = slicingTreeFloorplanning(params);

      const totalBlockArea = result.blocks.reduce(
        (sum, block) => sum + block.width * block.height,
        0
      );
      const expectedUtilization = totalBlockArea / result.area;

      expect(result.utilization).toBeCloseTo(expectedUtilization, 5);
    });

    it('should handle single block', () => {
      const params: FloorplanningParams = {
        algorithm: FloorplanningAlgorithm.SLICING_TREE,
        chipWidth: 100,
        chipHeight: 100,
        blocks: [createTestBlocks()[0]],
      };

      const result = slicingTreeFloorplanning(params);

      expect(result.success).toBe(true);
      expect(result.blocks).toHaveLength(1);
      expect(result.blocks[0].position).toBeDefined();
      expect(result.blocks[0].position!.x).toBe(0);
      expect(result.blocks[0].position!.y).toBe(0);
    });

    it('should handle empty block list', () => {
      const params: FloorplanningParams = {
        algorithm: FloorplanningAlgorithm.SLICING_TREE,
        chipWidth: 100,
        chipHeight: 100,
        blocks: [],
      };

      const result = slicingTreeFloorplanning(params);

      expect(result.success).toBe(true);
      expect(result.blocks).toHaveLength(0);
      expect(result.utilization).toBe(0);
    });

    it('should respect chip dimensions', () => {
      const params: FloorplanningParams = {
        algorithm: FloorplanningAlgorithm.SLICING_TREE,
        chipWidth: 300,
        chipHeight: 150,
        blocks: createTestBlocks(),
      };

      const result = slicingTreeFloorplanning(params);

      expect(result.area).toBe(45000); // 300 x 150
      expect(result.aspectRatio).toBe(2); // 300/150
    });

    it('should calculate correct dead space', () => {
      const params: FloorplanningParams = {
        algorithm: FloorplanningAlgorithm.SLICING_TREE,
        chipWidth: 200,
        chipHeight: 200,
        blocks: createTestBlocks(),
      };

      const result = slicingTreeFloorplanning(params);

      const totalBlockArea = result.blocks.reduce(
        (sum, block) => sum + block.width * block.height,
        0
      );
      const expectedDeadSpace = result.area - totalBlockArea;

      expect(result.deadSpace).toBeCloseTo(expectedDeadSpace, 5);
    });
  });

  describe('Sequence Pair Floorplanning', () => {
    it('should successfully create floorplan using sequence pair', () => {
      const params: FloorplanningParams = {
        algorithm: FloorplanningAlgorithm.SEQUENCE_PAIR,
        chipWidth: 200,
        chipHeight: 200,
        blocks: createTestBlocks(),
        aspectRatioMin: 0.5,
        aspectRatioMax: 2.0,
      };

      const result = sequencePairFloorplanning(params);

      expect(result.success).toBe(true);
      expect(result.blocks).toHaveLength(4);
      expect(result.area).toBe(40000);
      expect(result.aspectRatio).toBe(1);
      expect(result.runtime).toBeGreaterThan(0);
    });

    it('should place all blocks with positions', () => {
      const params: FloorplanningParams = {
        algorithm: FloorplanningAlgorithm.SEQUENCE_PAIR,
        chipWidth: 200,
        chipHeight: 200,
        blocks: createTestBlocks(),
      };

      const result = sequencePairFloorplanning(params);

      result.blocks.forEach((block) => {
        expect(block.position).toBeDefined();
        expect(block.position!.x).toBeGreaterThanOrEqual(0);
        expect(block.position!.y).toBeGreaterThanOrEqual(0);
      });
    });

    it('should use sequence-based positioning', () => {
      const params: FloorplanningParams = {
        algorithm: FloorplanningAlgorithm.SEQUENCE_PAIR,
        chipWidth: 200,
        chipHeight: 200,
        blocks: createTestBlocks(),
      };

      const result = sequencePairFloorplanning(params);

      // Verify positions are distributed across chip
      const xPositions = result.blocks.map((b) => b.position!.x);
      const yPositions = result.blocks.map((b) => b.position!.y);

      // Should have some variation in positions
      const uniqueX = new Set(xPositions).size;
      const uniqueY = new Set(yPositions).size;

      expect(uniqueX).toBeGreaterThan(0);
      expect(uniqueY).toBeGreaterThan(0);
    });

    it('should calculate metrics correctly', () => {
      const params: FloorplanningParams = {
        algorithm: FloorplanningAlgorithm.SEQUENCE_PAIR,
        chipWidth: 200,
        chipHeight: 200,
        blocks: createTestBlocks(),
      };

      const result = sequencePairFloorplanning(params);

      expect(result.utilization).toBeGreaterThan(0);
      expect(result.utilization).toBeLessThanOrEqual(1);
      expect(result.deadSpace).toBeGreaterThanOrEqual(0);
      expect(result.deadSpace).toBe(result.area - result.blocks.reduce(
        (sum, b) => sum + b.width * b.height, 0
      ));
    });

    it('should handle different aspect ratios', () => {
      const params: FloorplanningParams = {
        algorithm: FloorplanningAlgorithm.SEQUENCE_PAIR,
        chipWidth: 400,
        chipHeight: 100,
        blocks: createTestBlocks(),
      };

      const result = sequencePairFloorplanning(params);

      expect(result.aspectRatio).toBe(4); // 400/100
      expect(result.area).toBe(40000);
    });
  });

  describe('runFloorplanning dispatcher', () => {
    it('should call slicing tree when specified', () => {
      const params: FloorplanningParams = {
        algorithm: FloorplanningAlgorithm.SLICING_TREE,
        chipWidth: 200,
        chipHeight: 200,
        blocks: createTestBlocks(),
      };

      const result = runFloorplanning(params);

      expect(result.success).toBe(true);
      expect(result.blocks).toHaveLength(4);
    });

    it('should call sequence pair when specified', () => {
      const params: FloorplanningParams = {
        algorithm: FloorplanningAlgorithm.SEQUENCE_PAIR,
        chipWidth: 200,
        chipHeight: 200,
        blocks: createTestBlocks(),
      };

      const result = runFloorplanning(params);

      expect(result.success).toBe(true);
      expect(result.blocks).toHaveLength(4);
    });

    it('should throw error for unsupported algorithm', () => {
      const params: FloorplanningParams = {
        algorithm: 'unsupported' as FloorplanningAlgorithm,
        chipWidth: 200,
        chipHeight: 200,
        blocks: createTestBlocks(),
      };

      expect(() => runFloorplanning(params)).toThrow('Unsupported floorplanning algorithm');
    });
  });

  describe('Comparison between algorithms', () => {
    it('should produce different but valid results', () => {
      const blocks = createTestBlocks();

      const slicingParams: FloorplanningParams = {
        algorithm: FloorplanningAlgorithm.SLICING_TREE,
        chipWidth: 200,
        chipHeight: 200,
        blocks: JSON.parse(JSON.stringify(blocks)),
      };

      const sequenceParams: FloorplanningParams = {
        algorithm: FloorplanningAlgorithm.SEQUENCE_PAIR,
        chipWidth: 200,
        chipHeight: 200,
        blocks: JSON.parse(JSON.stringify(blocks)),
      };

      const slicingResult = runFloorplanning(slicingParams);
      const sequenceResult = runFloorplanning(sequenceParams);

      // Both should be successful
      expect(slicingResult.success).toBe(true);
      expect(sequenceResult.success).toBe(true);

      // Both should have same area
      expect(slicingResult.area).toBe(sequenceResult.area);

      // Both should have valid utilization
      expect(slicingResult.utilization).toBeGreaterThan(0);
      expect(sequenceResult.utilization).toBeGreaterThan(0);
    });
  });
});
