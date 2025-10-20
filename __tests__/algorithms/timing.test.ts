import {
  runTiming,
  staticTimingAnalysis,
  criticalPathAnalysis,
} from '@/lib/algorithms/timing';
import {
  TimingParams,
  TimingAlgorithm,
  Cell,
  Wire,
} from '@/types/algorithms';

describe('Timing Algorithms', () => {
  // Create test data
  const createTestCells = (): Cell[] => [
    {
      id: 'cell1',
      name: 'Cell 1',
      width: 10,
      height: 10,
      position: { x: 10, y: 10 },
      pins: [
        { id: 'pin1', name: 'IN1', position: { x: 0, y: 5 }, direction: 'input' },
        { id: 'pin2', name: 'OUT1', position: { x: 10, y: 5 }, direction: 'output' },
      ],
      type: 'standard',
    },
    {
      id: 'cell2',
      name: 'Cell 2',
      width: 10,
      height: 10,
      position: { x: 30, y: 10 },
      pins: [
        { id: 'pin3', name: 'IN2', position: { x: 0, y: 5 }, direction: 'input' },
        { id: 'pin4', name: 'OUT2', position: { x: 10, y: 5 }, direction: 'output' },
      ],
      type: 'standard',
    },
    {
      id: 'cell3',
      name: 'Cell 3',
      width: 10,
      height: 10,
      position: { x: 50, y: 10 },
      pins: [
        { id: 'pin5', name: 'IN3', position: { x: 0, y: 5 }, direction: 'input' },
        { id: 'pin6', name: 'OUT3', position: { x: 10, y: 5 }, direction: 'output' },
      ],
      type: 'standard',
    },
    {
      id: 'cell4',
      name: 'Cell 4',
      width: 10,
      height: 10,
      position: { x: 70, y: 10 },
      pins: [
        { id: 'pin7', name: 'IN4', position: { x: 0, y: 5 }, direction: 'input' },
        { id: 'pin8', name: 'OUT4', position: { x: 10, y: 5 }, direction: 'output' },
      ],
      type: 'standard',
    },
  ];

  const createTestWires = (): Wire[] => [
    {
      id: 'wire1',
      netId: 'net1',
      points: [
        { x: 20, y: 15 },
        { x: 30, y: 15 },
      ],
      layer: 0,
      width: 1,
    },
    {
      id: 'wire2',
      netId: 'net2',
      points: [
        { x: 40, y: 15 },
        { x: 50, y: 15 },
      ],
      layer: 0,
      width: 1,
    },
    {
      id: 'wire3',
      netId: 'net3',
      points: [
        { x: 60, y: 15 },
        { x: 70, y: 15 },
      ],
      layer: 0,
      width: 1,
    },
  ];

  const createSimpleNetlist = (): string => `
module test_circuit (
  input clk, a, b,
  output reg y
);
  reg q1, q2;
  always @(posedge clk) begin
    q1 <= a & b;
    q2 <= q1 | b;
    y <= q2;
  end
endmodule
  `.trim();

  describe('Static Timing Analysis', () => {
    it('should successfully perform static timing analysis', () => {
      const params: TimingParams = {
        algorithm: TimingAlgorithm.STATIC_TIMING_ANALYSIS,
        netlist: createSimpleNetlist(),
        clockPeriod: 10,
        cells: createTestCells(),
        wires: createTestWires(),
      };

      const result = staticTimingAnalysis(params);

      expect(result.criticalPath).toBeDefined();
      expect(result.criticalPath.length).toBeGreaterThan(0);
      expect(result.slackTime).toBeDefined();
      expect(result.setupViolations).toBeGreaterThanOrEqual(0);
      expect(result.holdViolations).toBeGreaterThanOrEqual(0);
      expect(result.maxDelay).toBeGreaterThan(0);
      expect(result.minDelay).toBeGreaterThanOrEqual(0);
      expect(result.clockSkew).toBeGreaterThanOrEqual(0);
      expect(result.runtime).toBeGreaterThan(0);
    });

    it('should meet timing when slack is positive', () => {
      const params: TimingParams = {
        algorithm: TimingAlgorithm.STATIC_TIMING_ANALYSIS,
        netlist: createSimpleNetlist(),
        clockPeriod: 20, // Large clock period
        cells: createTestCells(),
        wires: createTestWires(),
      };

      const result = staticTimingAnalysis(params);

      expect(result.success).toBe(true);
      expect(result.slackTime).toBeGreaterThanOrEqual(0);
      expect(result.setupViolations).toBe(0);
    });

    it('should detect timing violations when clock period is too small', () => {
      const params: TimingParams = {
        algorithm: TimingAlgorithm.STATIC_TIMING_ANALYSIS,
        netlist: createSimpleNetlist(),
        clockPeriod: 1, // Very small clock period
        cells: createTestCells(),
        wires: createTestWires(),
      };

      const result = staticTimingAnalysis(params);

      // Might have violations
      if (result.slackTime < 0) {
        expect(result.success).toBe(false);
        expect(result.setupViolations).toBeGreaterThan(0);
      }
    });

    it('should calculate correct slack time', () => {
      const params: TimingParams = {
        algorithm: TimingAlgorithm.STATIC_TIMING_ANALYSIS,
        netlist: createSimpleNetlist(),
        clockPeriod: 10,
        cells: createTestCells(),
        wires: createTestWires(),
      };

      const result = staticTimingAnalysis(params);

      const expectedSlack = params.clockPeriod - result.maxDelay;
      expect(result.slackTime).toBeCloseTo(expectedSlack, 5);
    });

    it('should identify critical path', () => {
      const params: TimingParams = {
        algorithm: TimingAlgorithm.STATIC_TIMING_ANALYSIS,
        netlist: createSimpleNetlist(),
        clockPeriod: 10,
        cells: createTestCells(),
        wires: createTestWires(),
      };

      const result = staticTimingAnalysis(params);

      expect(result.criticalPath).toBeDefined();
      expect(result.criticalPath.length).toBeGreaterThan(0);
      // Critical path should contain valid cell IDs
      result.criticalPath.forEach((cellId) => {
        expect(typeof cellId).toBe('string');
        expect(cellId.length).toBeGreaterThan(0);
      });
    });

    it('should report clock skew', () => {
      const params: TimingParams = {
        algorithm: TimingAlgorithm.STATIC_TIMING_ANALYSIS,
        netlist: createSimpleNetlist(),
        clockPeriod: 10,
        cells: createTestCells(),
        wires: createTestWires(),
      };

      const result = staticTimingAnalysis(params);

      expect(result.clockSkew).toBeGreaterThanOrEqual(0);
      expect(result.clockSkew).toBeLessThan(params.clockPeriod);
    });

    it('should handle circuits with few cells', () => {
      const params: TimingParams = {
        algorithm: TimingAlgorithm.STATIC_TIMING_ANALYSIS,
        netlist: createSimpleNetlist(),
        clockPeriod: 10,
        cells: [createTestCells()[0]],
        wires: [],
      };

      const result = staticTimingAnalysis(params);

      expect(result.criticalPath).toBeDefined();
      expect(result.maxDelay).toBeGreaterThanOrEqual(0);
    });

    it('should calculate min and max delays', () => {
      const params: TimingParams = {
        algorithm: TimingAlgorithm.STATIC_TIMING_ANALYSIS,
        netlist: createSimpleNetlist(),
        clockPeriod: 10,
        cells: createTestCells(),
        wires: createTestWires(),
      };

      const result = staticTimingAnalysis(params);

      expect(result.maxDelay).toBeGreaterThan(result.minDelay);
      expect(result.minDelay).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Critical Path Analysis', () => {
    it('should successfully find critical path', () => {
      const params: TimingParams = {
        algorithm: TimingAlgorithm.CRITICAL_PATH,
        netlist: createSimpleNetlist(),
        clockPeriod: 10,
        cells: createTestCells(),
        wires: createTestWires(),
      };

      const result = criticalPathAnalysis(params);

      expect(result.criticalPath).toBeDefined();
      expect(result.criticalPath.length).toBeGreaterThan(0);
      expect(result.maxDelay).toBeGreaterThan(0);
      expect(result.minDelay).toBeGreaterThan(0);
      expect(result.slackTime).toBeDefined();
      expect(result.runtime).toBeGreaterThan(0);
    });

    it('should identify longest path', () => {
      const params: TimingParams = {
        algorithm: TimingAlgorithm.CRITICAL_PATH,
        netlist: createSimpleNetlist(),
        clockPeriod: 10,
        cells: createTestCells(),
        wires: createTestWires(),
      };

      const result = criticalPathAnalysis(params);

      // Critical path should go through multiple cells
      expect(result.criticalPath.length).toBeGreaterThan(0);
      expect(result.criticalPath.length).toBeLessThanOrEqual(createTestCells().length);
    });

    it('should meet timing with sufficient clock period', () => {
      const params: TimingParams = {
        algorithm: TimingAlgorithm.CRITICAL_PATH,
        netlist: createSimpleNetlist(),
        clockPeriod: 30,
        cells: createTestCells(),
        wires: createTestWires(),
      };

      const result = criticalPathAnalysis(params);

      expect(result.success).toBe(true);
      expect(result.slackTime).toBeGreaterThanOrEqual(0);
      expect(result.setupViolations).toBe(0);
    });

    it('should detect violations with tight timing', () => {
      const params: TimingParams = {
        algorithm: TimingAlgorithm.CRITICAL_PATH,
        netlist: createSimpleNetlist(),
        clockPeriod: 2,
        cells: createTestCells(),
        wires: createTestWires(),
      };

      const result = criticalPathAnalysis(params);

      // Tight timing might cause violations
      if (result.maxDelay > params.clockPeriod) {
        expect(result.success).toBe(false);
        expect(result.slackTime).toBeLessThan(0);
        expect(result.setupViolations).toBeGreaterThan(0);
      }
    });

    it('should calculate slack correctly', () => {
      const params: TimingParams = {
        algorithm: TimingAlgorithm.CRITICAL_PATH,
        netlist: createSimpleNetlist(),
        clockPeriod: 15,
        cells: createTestCells(),
        wires: createTestWires(),
      };

      const result = criticalPathAnalysis(params);

      const expectedSlack = params.clockPeriod - result.maxDelay;
      expect(result.slackTime).toBeCloseTo(expectedSlack, 5);
    });

    it('should handle single cell path', () => {
      const params: TimingParams = {
        algorithm: TimingAlgorithm.CRITICAL_PATH,
        netlist: createSimpleNetlist(),
        clockPeriod: 10,
        cells: [createTestCells()[0]],
        wires: [],
      };

      const result = criticalPathAnalysis(params);

      expect(result.criticalPath).toBeDefined();
      expect(result.criticalPath.length).toBeGreaterThan(0);
      expect(result.maxDelay).toBeGreaterThan(0);
    });

    it('should report no hold violations for critical path', () => {
      const params: TimingParams = {
        algorithm: TimingAlgorithm.CRITICAL_PATH,
        netlist: createSimpleNetlist(),
        clockPeriod: 10,
        cells: createTestCells(),
        wires: createTestWires(),
      };

      const result = criticalPathAnalysis(params);

      expect(result.holdViolations).toBe(0);
    });

    it('should calculate reasonable delays', () => {
      const params: TimingParams = {
        algorithm: TimingAlgorithm.CRITICAL_PATH,
        netlist: createSimpleNetlist(),
        clockPeriod: 10,
        cells: createTestCells(),
        wires: createTestWires(),
      };

      const result = criticalPathAnalysis(params);

      // Max delay should be greater than min delay
      expect(result.maxDelay).toBeGreaterThan(result.minDelay);
      // Min delay should be about 30% of max
      expect(result.minDelay).toBeGreaterThan(result.maxDelay * 0.2);
      expect(result.minDelay).toBeLessThan(result.maxDelay * 0.5);
    });
  });

  describe('runTiming dispatcher', () => {
    it('should call static timing analysis when specified', () => {
      const params: TimingParams = {
        algorithm: TimingAlgorithm.STATIC_TIMING_ANALYSIS,
        netlist: createSimpleNetlist(),
        clockPeriod: 10,
        cells: createTestCells(),
        wires: createTestWires(),
      };

      const result = runTiming(params);

      expect(result.criticalPath).toBeDefined();
      expect(result.clockSkew).toBeGreaterThanOrEqual(0);
    });

    it('should call critical path analysis when specified', () => {
      const params: TimingParams = {
        algorithm: TimingAlgorithm.CRITICAL_PATH,
        netlist: createSimpleNetlist(),
        clockPeriod: 10,
        cells: createTestCells(),
        wires: createTestWires(),
      };

      const result = runTiming(params);

      expect(result.criticalPath).toBeDefined();
      expect(result.criticalPath.length).toBeGreaterThan(0);
    });

    it('should throw error for unsupported algorithm', () => {
      const params: TimingParams = {
        algorithm: 'invalid' as TimingAlgorithm,
        netlist: createSimpleNetlist(),
        clockPeriod: 10,
        cells: createTestCells(),
        wires: createTestWires(),
      };

      expect(() => runTiming(params)).toThrow('Unsupported timing algorithm');
    });
  });

  describe('Comparison between algorithms', () => {
    it('should produce consistent results', () => {
      const cells = createTestCells();
      const wires = createTestWires();
      const netlist = createSimpleNetlist();
      const clockPeriod = 10;

      const staParams: TimingParams = {
        algorithm: TimingAlgorithm.STATIC_TIMING_ANALYSIS,
        netlist,
        clockPeriod,
        cells,
        wires,
      };

      const cpParams: TimingParams = {
        algorithm: TimingAlgorithm.CRITICAL_PATH,
        netlist,
        clockPeriod,
        cells,
        wires,
      };

      const staResult = runTiming(staParams);
      const cpResult = runTiming(cpParams);

      // Both should identify a critical path
      expect(staResult.criticalPath.length).toBeGreaterThan(0);
      expect(cpResult.criticalPath.length).toBeGreaterThan(0);

      // Both should calculate delays
      expect(staResult.maxDelay).toBeGreaterThan(0);
      expect(cpResult.maxDelay).toBeGreaterThan(0);

      // Both should calculate slack
      expect(staResult.slackTime).toBeDefined();
      expect(cpResult.slackTime).toBeDefined();
    });
  });
});
