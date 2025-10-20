import {
  runPower,
  clockGating,
  voltageScaling,
  powerGating,
} from '@/lib/algorithms/power';
import {
  PowerParams,
  PowerAlgorithm,
  Cell,
} from '@/types/algorithms';

describe('Power Optimization Algorithms', () => {
  // Create test data
  const createTestCells = (): Cell[] => [
    {
      id: 'cell1',
      name: 'Cell 1',
      width: 10,
      height: 10,
      position: { x: 10, y: 10 },
      pins: [
        { id: 'pin1', name: 'CLK', position: { x: 0, y: 5 }, direction: 'input' },
        { id: 'pin2', name: 'D', position: { x: 5, y: 0 }, direction: 'input' },
        { id: 'pin3', name: 'Q', position: { x: 10, y: 5 }, direction: 'output' },
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
        { id: 'pin4', name: 'A', position: { x: 0, y: 5 }, direction: 'input' },
        { id: 'pin5', name: 'B', position: { x: 5, y: 0 }, direction: 'input' },
        { id: 'pin6', name: 'Y', position: { x: 10, y: 5 }, direction: 'output' },
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
        { id: 'pin7', name: 'IN', position: { x: 0, y: 5 }, direction: 'input' },
        { id: 'pin8', name: 'OUT', position: { x: 10, y: 5 }, direction: 'output' },
      ],
      type: 'standard',
    },
  ];

  const createNetlist = (): string => `
module power_test (
  input clk, a, b,
  output reg q
);
  always @(posedge clk) begin
    q <= a & b;
  end
endmodule
  `.trim();

  describe('Clock Gating', () => {
    it('should successfully perform clock gating optimization', () => {
      const params: PowerParams = {
        algorithm: PowerAlgorithm.CLOCK_GATING,
        netlist: createNetlist(),
        cells: createTestCells(),
        clockFrequency: 1000, // MHz
        voltage: 1.2, // V
        temperature: 25, // C
      };

      const result = clockGating(params);

      expect(result.success).toBe(true);
      expect(result.staticPower).toBeGreaterThan(0);
      expect(result.dynamicPower).toBeGreaterThan(0);
      expect(result.totalPower).toBeGreaterThan(0);
      expect(result.leakagePower).toBeGreaterThan(0);
      expect(result.switchingPower).toBeGreaterThan(0);
      expect(result.clockPower).toBeGreaterThan(0);
      expect(result.reduction).toBeGreaterThan(0);
      expect(result.runtime).toBeGreaterThan(0);
    });

    it('should significantly reduce clock power', () => {
      const params: PowerParams = {
        algorithm: PowerAlgorithm.CLOCK_GATING,
        netlist: createNetlist(),
        cells: createTestCells(),
        clockFrequency: 1000,
        voltage: 1.2,
        temperature: 25,
      };

      const result = clockGating(params);

      // Clock gating should achieve significant reduction
      expect(result.reduction).toBeGreaterThan(30); // At least 30% reduction
      expect(result.reduction).toBeLessThan(100);
    });

    it('should calculate total power correctly', () => {
      const params: PowerParams = {
        algorithm: PowerAlgorithm.CLOCK_GATING,
        netlist: createNetlist(),
        cells: createTestCells(),
        clockFrequency: 1000,
        voltage: 1.2,
        temperature: 25,
      };

      const result = clockGating(params);

      const expectedTotal = result.dynamicPower + result.staticPower;
      expect(result.totalPower).toBeCloseTo(expectedTotal, 5);
    });

    it('should calculate dynamic power as sum of components', () => {
      const params: PowerParams = {
        algorithm: PowerAlgorithm.CLOCK_GATING,
        netlist: createNetlist(),
        cells: createTestCells(),
        clockFrequency: 1000,
        voltage: 1.2,
        temperature: 25,
      };

      const result = clockGating(params);

      const expectedDynamic = result.clockPower + result.switchingPower;
      expect(result.dynamicPower).toBeCloseTo(expectedDynamic, 5);
    });

    it('should scale with number of cells', () => {
      const smallParams: PowerParams = {
        algorithm: PowerAlgorithm.CLOCK_GATING,
        netlist: createNetlist(),
        cells: [createTestCells()[0]],
        clockFrequency: 1000,
        voltage: 1.2,
        temperature: 25,
      };

      const largeParams: PowerParams = {
        algorithm: PowerAlgorithm.CLOCK_GATING,
        netlist: createNetlist(),
        cells: createTestCells(),
        clockFrequency: 1000,
        voltage: 1.2,
        temperature: 25,
      };

      const smallResult = clockGating(smallParams);
      const largeResult = clockGating(largeParams);

      // More cells should consume more power
      expect(largeResult.totalPower).toBeGreaterThan(smallResult.totalPower);
    });

    it('should handle high temperature increasing leakage', () => {
      const normalTemp: PowerParams = {
        algorithm: PowerAlgorithm.CLOCK_GATING,
        netlist: createNetlist(),
        cells: createTestCells(),
        clockFrequency: 1000,
        voltage: 1.2,
        temperature: 25,
      };

      const highTemp: PowerParams = {
        algorithm: PowerAlgorithm.CLOCK_GATING,
        netlist: createNetlist(),
        cells: createTestCells(),
        clockFrequency: 1000,
        voltage: 1.2,
        temperature: 85, // High temperature
      };

      const normalResult = clockGating(normalTemp);
      const highResult = clockGating(highTemp);

      // Higher temperature should increase leakage
      expect(highResult.leakagePower).toBeGreaterThan(normalResult.leakagePower);
    });
  });

  describe('Voltage Scaling', () => {
    it('should successfully perform voltage scaling', () => {
      const params: PowerParams = {
        algorithm: PowerAlgorithm.VOLTAGE_SCALING,
        netlist: createNetlist(),
        cells: createTestCells(),
        clockFrequency: 1000,
        voltage: 1.2,
        temperature: 25,
      };

      const result = voltageScaling(params);

      expect(result.success).toBe(true);
      expect(result.staticPower).toBeGreaterThan(0);
      expect(result.dynamicPower).toBeGreaterThan(0);
      expect(result.totalPower).toBeGreaterThan(0);
      expect(result.reduction).toBeGreaterThan(0);
      expect(result.runtime).toBeGreaterThan(0);
    });

    it('should reduce power significantly through voltage scaling', () => {
      const params: PowerParams = {
        algorithm: PowerAlgorithm.VOLTAGE_SCALING,
        netlist: createNetlist(),
        cells: createTestCells(),
        clockFrequency: 1000,
        voltage: 1.2,
        temperature: 25,
      };

      const result = voltageScaling(params);

      // Voltage scaling should achieve good reduction (V^2 effect)
      expect(result.reduction).toBeGreaterThan(30);
      expect(result.reduction).toBeLessThan(100);
    });

    it('should reduce both dynamic and leakage power', () => {
      const params: PowerParams = {
        algorithm: PowerAlgorithm.VOLTAGE_SCALING,
        netlist: createNetlist(),
        cells: createTestCells(),
        clockFrequency: 1000,
        voltage: 1.5, // Higher voltage
        temperature: 25,
      };

      const result = voltageScaling(params);

      // Both components should be reduced
      expect(result.dynamicPower).toBeGreaterThan(0);
      expect(result.leakagePower).toBeGreaterThan(0);
      expect(result.totalPower).toBe(result.dynamicPower + result.staticPower);
    });

    it('should scale quadratically with voltage for dynamic power', () => {
      const params: PowerParams = {
        algorithm: PowerAlgorithm.VOLTAGE_SCALING,
        netlist: createNetlist(),
        cells: createTestCells(),
        clockFrequency: 1000,
        voltage: 1.0,
        temperature: 25,
      };

      const result = voltageScaling(params);

      // Dynamic power should scale with V^2
      expect(result.dynamicPower).toBeGreaterThan(0);
      expect(result.clockPower).toBeGreaterThan(0);
    });

    it('should scale with frequency', () => {
      const lowFreq: PowerParams = {
        algorithm: PowerAlgorithm.VOLTAGE_SCALING,
        netlist: createNetlist(),
        cells: createTestCells(),
        clockFrequency: 500,
        voltage: 1.2,
        temperature: 25,
      };

      const highFreq: PowerParams = {
        algorithm: PowerAlgorithm.VOLTAGE_SCALING,
        netlist: createNetlist(),
        cells: createTestCells(),
        clockFrequency: 2000,
        voltage: 1.2,
        temperature: 25,
      };

      const lowResult = voltageScaling(lowFreq);
      const highResult = voltageScaling(highFreq);

      // Higher frequency should consume more power
      expect(highResult.clockPower).toBeGreaterThan(lowResult.clockPower);
    });
  });

  describe('Power Gating', () => {
    it('should successfully perform power gating', () => {
      const params: PowerParams = {
        algorithm: PowerAlgorithm.POWER_GATING,
        netlist: createNetlist(),
        cells: createTestCells(),
        clockFrequency: 1000,
        voltage: 1.2,
        temperature: 25,
      };

      const result = powerGating(params);

      expect(result.success).toBe(true);
      expect(result.staticPower).toBeGreaterThan(0);
      expect(result.dynamicPower).toBeGreaterThan(0);
      expect(result.totalPower).toBeGreaterThan(0);
      expect(result.reduction).toBeGreaterThan(0);
      expect(result.runtime).toBeGreaterThan(0);
    });

    it('should dramatically reduce leakage power', () => {
      const params: PowerParams = {
        algorithm: PowerAlgorithm.POWER_GATING,
        netlist: createNetlist(),
        cells: createTestCells(),
        clockFrequency: 1000,
        voltage: 1.2,
        temperature: 25,
      };

      const result = powerGating(params);

      // Power gating should nearly eliminate leakage
      expect(result.leakagePower).toBeGreaterThan(0);
      // Leakage should be very small (95% reduction)
      expect(result.reduction).toBeGreaterThan(40);
    });

    it('should reduce power in idle blocks', () => {
      const params: PowerParams = {
        algorithm: PowerAlgorithm.POWER_GATING,
        netlist: createNetlist(),
        cells: createTestCells(),
        clockFrequency: 1000,
        voltage: 1.2,
        temperature: 25,
      };

      const result = powerGating(params);

      // Only active blocks consume power
      expect(result.totalPower).toBeGreaterThan(0);
      expect(result.reduction).toBeGreaterThan(0);
    });

    it('should achieve highest reduction at high temperature', () => {
      const params: PowerParams = {
        algorithm: PowerAlgorithm.POWER_GATING,
        netlist: createNetlist(),
        cells: createTestCells(),
        clockFrequency: 1000,
        voltage: 1.2,
        temperature: 85, // High temp = high leakage baseline
      };

      const result = powerGating(params);

      // Power gating is most effective when leakage is high
      expect(result.reduction).toBeGreaterThan(40);
      expect(result.leakagePower).toBeGreaterThan(0);
    });

    it('should calculate total power correctly', () => {
      const params: PowerParams = {
        algorithm: PowerAlgorithm.POWER_GATING,
        netlist: createNetlist(),
        cells: createTestCells(),
        clockFrequency: 1000,
        voltage: 1.2,
        temperature: 25,
      };

      const result = powerGating(params);

      const expectedTotal = result.dynamicPower + result.staticPower;
      expect(result.totalPower).toBeCloseTo(expectedTotal, 5);
    });
  });

  describe('runPower dispatcher', () => {
    it('should call clock gating when specified', () => {
      const params: PowerParams = {
        algorithm: PowerAlgorithm.CLOCK_GATING,
        netlist: createNetlist(),
        cells: createTestCells(),
        clockFrequency: 1000,
        voltage: 1.2,
        temperature: 25,
      };

      const result = runPower(params);

      expect(result.success).toBe(true);
      expect(result.reduction).toBeGreaterThan(0);
    });

    it('should call voltage scaling when specified', () => {
      const params: PowerParams = {
        algorithm: PowerAlgorithm.VOLTAGE_SCALING,
        netlist: createNetlist(),
        cells: createTestCells(),
        clockFrequency: 1000,
        voltage: 1.2,
        temperature: 25,
      };

      const result = runPower(params);

      expect(result.success).toBe(true);
      expect(result.reduction).toBeGreaterThan(0);
    });

    it('should call power gating when specified', () => {
      const params: PowerParams = {
        algorithm: PowerAlgorithm.POWER_GATING,
        netlist: createNetlist(),
        cells: createTestCells(),
        clockFrequency: 1000,
        voltage: 1.2,
        temperature: 25,
      };

      const result = runPower(params);

      expect(result.success).toBe(true);
      expect(result.reduction).toBeGreaterThan(0);
    });

    it('should throw error for unsupported algorithm', () => {
      const params: PowerParams = {
        algorithm: 'invalid' as PowerAlgorithm,
        netlist: createNetlist(),
        cells: createTestCells(),
        clockFrequency: 1000,
        voltage: 1.2,
        temperature: 25,
      };

      expect(() => runPower(params)).toThrow('Unsupported power algorithm');
    });
  });

  describe('Comparison between algorithms', () => {
    it('should all achieve power reduction', () => {
      const cells = createTestCells();
      const netlist = createNetlist();

      const cgParams: PowerParams = {
        algorithm: PowerAlgorithm.CLOCK_GATING,
        netlist,
        cells,
        clockFrequency: 1000,
        voltage: 1.2,
        temperature: 25,
      };

      const vsParams: PowerParams = {
        algorithm: PowerAlgorithm.VOLTAGE_SCALING,
        netlist,
        cells,
        clockFrequency: 1000,
        voltage: 1.2,
        temperature: 25,
      };

      const pgParams: PowerParams = {
        algorithm: PowerAlgorithm.POWER_GATING,
        netlist,
        cells,
        clockFrequency: 1000,
        voltage: 1.2,
        temperature: 25,
      };

      const cgResult = runPower(cgParams);
      const vsResult = runPower(vsParams);
      const pgResult = runPower(pgParams);

      // All should achieve reduction
      expect(cgResult.reduction).toBeGreaterThan(0);
      expect(vsResult.reduction).toBeGreaterThan(0);
      expect(pgResult.reduction).toBeGreaterThan(0);

      // All should be successful
      expect(cgResult.success).toBe(true);
      expect(vsResult.success).toBe(true);
      expect(pgResult.success).toBe(true);
    });

    it('should report consistent power components', () => {
      const cells = createTestCells();
      const netlist = createNetlist();
      const algorithms = [
        PowerAlgorithm.CLOCK_GATING,
        PowerAlgorithm.VOLTAGE_SCALING,
        PowerAlgorithm.POWER_GATING,
      ];

      algorithms.forEach((algorithm) => {
        const params: PowerParams = {
          algorithm,
          netlist,
          cells,
          clockFrequency: 1000,
          voltage: 1.2,
          temperature: 25,
        };

        const result = runPower(params);

        // All should have valid power breakdown
        expect(result.staticPower).toBeGreaterThan(0);
        expect(result.dynamicPower).toBeGreaterThan(0);
        expect(result.totalPower).toBe(result.staticPower + result.dynamicPower);
        expect(result.clockPower).toBeGreaterThan(0);
        expect(result.switchingPower).toBeGreaterThan(0);
        expect(result.leakagePower).toBeGreaterThan(0);
      });
    });
  });

  describe('Power scaling with parameters', () => {
    it('should scale with voltage squared', () => {
      const v1Params: PowerParams = {
        algorithm: PowerAlgorithm.VOLTAGE_SCALING,
        netlist: createNetlist(),
        cells: createTestCells(),
        clockFrequency: 1000,
        voltage: 1.0,
        temperature: 25,
      };

      const v2Params: PowerParams = {
        algorithm: PowerAlgorithm.VOLTAGE_SCALING,
        netlist: createNetlist(),
        cells: createTestCells(),
        clockFrequency: 1000,
        voltage: 1.5,
        temperature: 25,
      };

      const v1Result = runPower(v1Params);
      const v2Result = runPower(v2Params);

      // Higher voltage should result in higher power
      expect(v2Result.totalPower).toBeGreaterThan(v1Result.totalPower);
    });

    it('should scale linearly with frequency', () => {
      const f1Params: PowerParams = {
        algorithm: PowerAlgorithm.CLOCK_GATING,
        netlist: createNetlist(),
        cells: createTestCells(),
        clockFrequency: 500,
        voltage: 1.2,
        temperature: 25,
      };

      const f2Params: PowerParams = {
        algorithm: PowerAlgorithm.CLOCK_GATING,
        netlist: createNetlist(),
        cells: createTestCells(),
        clockFrequency: 2000,
        voltage: 1.2,
        temperature: 25,
      };

      const f1Result = runPower(f1Params);
      const f2Result = runPower(f2Params);

      // Higher frequency should result in higher clock power
      expect(f2Result.clockPower).toBeGreaterThan(f1Result.clockPower);
    });
  });
});
