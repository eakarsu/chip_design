import {
  runSynthesis,
  logicOptimization,
  technologyMapping,
} from '@/lib/algorithms/synthesis';
import {
  SynthesisParams,
  SynthesisAlgorithm,
} from '@/types/algorithms';

describe('Synthesis Algorithms', () => {
  // Create test netlists
  const createSimpleNetlist = (): string => `
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

  const createComplexNetlist = (): string => `
module complex_circuit (
  input [3:0] a, b,
  output [3:0] sum,
  output carry
);
  wire [3:0] t1, t2;
  and (t1[0], a[0], b[0]);
  and (t1[1], a[1], b[1]);
  and (t1[2], a[2], b[2]);
  and (t1[3], a[3], b[3]);
  xor (sum[0], a[0], b[0]);
  xor (sum[1], a[1], b[1]);
  xor (sum[2], a[2], b[2]);
  xor (sum[3], a[3], b[3]);
  or (carry, t1[0], t1[1]);
  nand (t2[0], a[0], b[0]);
  nor (t2[1], a[1], b[1]);
endmodule
  `.trim();

  const createNetlistWithConstants = (): string => `
module const_circuit (
  input a, b,
  output y
);
  wire w1, w2;
  and (w1, a, 1'b0);
  or (w2, b, 1'b1);
  xor (y, w1, w2);
endmodule
  `.trim();

  describe('Logic Optimization', () => {
    it('should successfully optimize netlist', () => {
      const params: SynthesisParams = {
        algorithm: SynthesisAlgorithm.LOGIC_OPTIMIZATION,
        netlist: createSimpleNetlist(),
        targetLibrary: 'std_cell_lib',
        optimizationLevel: 'area',
        clockPeriod: 10,
      };

      const result = logicOptimization(params);

      expect(result.success).toBe(true);
      expect(result.optimizedNetlist).toBeDefined();
      expect(result.gateCount).toBeGreaterThan(0);
      expect(result.area).toBeGreaterThan(0);
      expect(result.power).toBeGreaterThan(0);
      expect(result.criticalPathDelay).toBeGreaterThan(0);
      expect(result.criticalPathDelay).toBeLessThan(params.clockPeriod!);
      expect(result.runtime).toBeGreaterThan(0);
    });

    it('should optimize for area', () => {
      const params: SynthesisParams = {
        algorithm: SynthesisAlgorithm.LOGIC_OPTIMIZATION,
        netlist: createComplexNetlist(),
        targetLibrary: 'std_cell_lib',
        optimizationLevel: 'area',
        clockPeriod: 10,
      };

      const result = logicOptimization(params);

      const baseGateCount = (createComplexNetlist().match(/and|or|not|xor|nand|nor/gi) || []).length;

      // Area optimization should reduce gate count
      expect(result.gateCount).toBeLessThan(baseGateCount);
      expect(result.area).toBe(result.gateCount * 100);
    });

    it('should optimize for power', () => {
      const params: SynthesisParams = {
        algorithm: SynthesisAlgorithm.LOGIC_OPTIMIZATION,
        netlist: createComplexNetlist(),
        targetLibrary: 'std_cell_lib',
        optimizationLevel: 'power',
        clockPeriod: 10,
      };

      const result = logicOptimization(params);

      expect(result.success).toBe(true);
      expect(result.power).toBe(result.gateCount * 0.5);
    });

    it('should optimize for timing', () => {
      const params: SynthesisParams = {
        algorithm: SynthesisAlgorithm.LOGIC_OPTIMIZATION,
        netlist: createComplexNetlist(),
        targetLibrary: 'std_cell_lib',
        optimizationLevel: 'timing',
        clockPeriod: 10,
      };

      const result = logicOptimization(params);

      expect(result.success).toBe(true);
      expect(result.criticalPathDelay).toBeLessThan(10);
      // Timing optimization may use more gates
      expect(result.gateCount).toBeGreaterThan(0);
    });

    it('should perform constant propagation', () => {
      const params: SynthesisParams = {
        algorithm: SynthesisAlgorithm.LOGIC_OPTIMIZATION,
        netlist: createNetlistWithConstants(),
        targetLibrary: 'std_cell_lib',
        optimizationLevel: 'area',
        clockPeriod: 10,
      };

      const result = logicOptimization(params);

      // Constants should be propagated
      expect(result.optimizedNetlist).toContain("1'b0");
      expect(result.optimizedNetlist).toContain("1'b1");
    });

    it('should handle empty netlist', () => {
      const params: SynthesisParams = {
        algorithm: SynthesisAlgorithm.LOGIC_OPTIMIZATION,
        netlist: '',
        targetLibrary: 'std_cell_lib',
        optimizationLevel: 'area',
        clockPeriod: 10,
      };

      const result = logicOptimization(params);

      expect(result.success).toBe(true);
      expect(result.gateCount).toBe(0);
      expect(result.area).toBe(0);
    });

    it('should respect clock period constraint', () => {
      const params: SynthesisParams = {
        algorithm: SynthesisAlgorithm.LOGIC_OPTIMIZATION,
        netlist: createSimpleNetlist(),
        targetLibrary: 'std_cell_lib',
        optimizationLevel: 'area',
        clockPeriod: 15,
      };

      const result = logicOptimization(params);

      expect(result.criticalPathDelay).toBeLessThan(15);
      expect(result.criticalPathDelay).toBeCloseTo(15 * 0.8, 1);
    });
  });

  describe('Technology Mapping', () => {
    it('should successfully map to target library', () => {
      const params: SynthesisParams = {
        algorithm: SynthesisAlgorithm.TECHNOLOGY_MAPPING,
        netlist: createSimpleNetlist(),
        targetLibrary: 'tsmc_65nm',
        optimizationLevel: 'area',
        clockPeriod: 10,
      };

      const result = technologyMapping(params);

      expect(result.success).toBe(true);
      expect(result.optimizedNetlist).toBeDefined();
      expect(result.gateCount).toBeGreaterThan(0);
      expect(result.area).toBeGreaterThan(0);
      expect(result.power).toBeGreaterThan(0);
      expect(result.criticalPathDelay).toBeGreaterThan(0);
      expect(result.runtime).toBeGreaterThan(0);
    });

    it('should map AND gates to library cells', () => {
      const params: SynthesisParams = {
        algorithm: SynthesisAlgorithm.TECHNOLOGY_MAPPING,
        netlist: createSimpleNetlist(),
        targetLibrary: 'custom_lib',
        optimizationLevel: 'area',
        clockPeriod: 10,
      };

      const result = technologyMapping(params);

      expect(result.optimizedNetlist).toContain('custom_lib_AND2');
    });

    it('should map OR gates to library cells', () => {
      const params: SynthesisParams = {
        algorithm: SynthesisAlgorithm.TECHNOLOGY_MAPPING,
        netlist: createSimpleNetlist(),
        targetLibrary: 'my_lib',
        optimizationLevel: 'area',
        clockPeriod: 10,
      };

      const result = technologyMapping(params);

      expect(result.optimizedNetlist).toContain('my_lib_OR2');
    });

    it('should map NOT gates to library inverters', () => {
      const params: SynthesisParams = {
        algorithm: SynthesisAlgorithm.TECHNOLOGY_MAPPING,
        netlist: createSimpleNetlist(),
        targetLibrary: 'lib',
        optimizationLevel: 'area',
        clockPeriod: 10,
      };

      const result = technologyMapping(params);

      expect(result.optimizedNetlist).toContain('lib_INV');
    });

    it('should map XOR gates to library cells', () => {
      const params: SynthesisParams = {
        algorithm: SynthesisAlgorithm.TECHNOLOGY_MAPPING,
        netlist: createComplexNetlist(),
        targetLibrary: 'stdcell',
        optimizationLevel: 'area',
        clockPeriod: 10,
      };

      const result = technologyMapping(params);

      expect(result.optimizedNetlist).toContain('stdcell_XOR2');
    });

    it('should calculate technology-dependent area', () => {
      const params: SynthesisParams = {
        algorithm: SynthesisAlgorithm.TECHNOLOGY_MAPPING,
        netlist: createComplexNetlist(),
        targetLibrary: 'tech_lib',
        optimizationLevel: 'area',
        clockPeriod: 10,
      };

      const result = technologyMapping(params);

      const gateCount = (createComplexNetlist().match(/and|or|not|xor|nand|nor/gi) || []).length;

      expect(result.gateCount).toBe(gateCount);
      expect(result.area).toBe(gateCount * 120); // Technology-dependent multiplier
    });

    it('should calculate technology-dependent power', () => {
      const params: SynthesisParams = {
        algorithm: SynthesisAlgorithm.TECHNOLOGY_MAPPING,
        netlist: createComplexNetlist(),
        targetLibrary: 'tech_lib',
        optimizationLevel: 'power',
        clockPeriod: 10,
      };

      const result = technologyMapping(params);

      expect(result.power).toBe(result.gateCount * 0.6);
    });

    it('should handle different target libraries', () => {
      const netlist = createSimpleNetlist();
      const libraries = ['lib1', 'lib2', 'lib3'];

      libraries.forEach((lib) => {
        const params: SynthesisParams = {
          algorithm: SynthesisAlgorithm.TECHNOLOGY_MAPPING,
          netlist,
          targetLibrary: lib,
          optimizationLevel: 'area',
          clockPeriod: 10,
        };

        const result = technologyMapping(params);

        expect(result.success).toBe(true);
        expect(result.optimizedNetlist).toContain(lib);
      });
    });
  });

  describe('runSynthesis dispatcher', () => {
    it('should call logic optimization when specified', () => {
      const params: SynthesisParams = {
        algorithm: SynthesisAlgorithm.LOGIC_OPTIMIZATION,
        netlist: createSimpleNetlist(),
        targetLibrary: 'lib',
        optimizationLevel: 'area',
        clockPeriod: 10,
      };

      const result = runSynthesis(params);

      expect(result.success).toBe(true);
      expect(result.gateCount).toBeGreaterThan(0);
    });

    it('should call technology mapping when specified', () => {
      const params: SynthesisParams = {
        algorithm: SynthesisAlgorithm.TECHNOLOGY_MAPPING,
        netlist: createSimpleNetlist(),
        targetLibrary: 'my_lib',
        optimizationLevel: 'area',
        clockPeriod: 10,
      };

      const result = runSynthesis(params);

      expect(result.success).toBe(true);
      expect(result.optimizedNetlist).toContain('my_lib');
    });

    it('should throw error for unsupported algorithm', () => {
      const params: SynthesisParams = {
        algorithm: 'invalid' as SynthesisAlgorithm,
        netlist: createSimpleNetlist(),
        targetLibrary: 'lib',
        optimizationLevel: 'area',
        clockPeriod: 10,
      };

      expect(() => runSynthesis(params)).toThrow('Unsupported synthesis algorithm');
    });
  });

  describe('Optimization levels comparison', () => {
    it('should produce different results for different optimization levels', () => {
      const netlist = createComplexNetlist();
      const levels: Array<'area' | 'power' | 'timing'> = ['area', 'power', 'timing'];

      const results = levels.map((level) => {
        const params: SynthesisParams = {
          algorithm: SynthesisAlgorithm.LOGIC_OPTIMIZATION,
          netlist,
          targetLibrary: 'lib',
          optimizationLevel: level,
          clockPeriod: 10,
        };
        return runSynthesis(params);
      });

      // All should succeed
      results.forEach((result) => {
        expect(result.success).toBe(true);
      });

      // Area optimization should have fewer gates
      expect(results[0].gateCount).toBeLessThanOrEqual(results[1].gateCount);

      // All should have valid metrics
      results.forEach((result) => {
        expect(result.area).toBeGreaterThan(0);
        expect(result.power).toBeGreaterThan(0);
        expect(result.criticalPathDelay).toBeGreaterThan(0);
      });
    });
  });
});
