/** @jest-environment node */

import {
  analyzePrecisionSweep,
  classifyRoofline,
  DEFAULT_ACCELERATOR_ARCHITECTURE_INPUT,
  evaluateAcceleratorArchitecture,
  recommendTile,
} from '@/lib/acceleratorArchitecture';
import { DEFAULT_MAC_ARRAY, generateMacArrayVerilog } from '@/lib/ai/rtlSkeleton';

describe('precision sweep and roofline analysis', () => {
  it('sweeps INT4, INT8 and INT16 and rewards lower precision with higher effective peak', () => {
    const sweep = analyzePrecisionSweep(DEFAULT_ACCELERATOR_ARCHITECTURE_INPUT);

    expect(sweep).toHaveLength(3);
    expect(sweep.map((point) => point.precisionBits)).toEqual([4, 8, 16]);
    const [int4, int8, int16] = sweep;
    expect(int4.bytesPerElement).toBe(0.5);
    expect(int8.bytesPerElement).toBe(1);
    expect(int16.bytesPerElement).toBe(2);
    expect(int4.peakTops).toBeGreaterThan(int8.peakTops);
    expect(int8.peakTops).toBeGreaterThan(int16.peakTops);
    expect(int4.sustainedTops).toBeGreaterThan(int8.sustainedTops);
    expect(int8.sustainedTops).toBeGreaterThan(int16.sustainedTops);

    for (const point of sweep) {
      expect(point.bandwidthRoofTops).toBeGreaterThan(0);
      expect(point.arithmeticIntensityOpsPerByte).toBeGreaterThan(0);
      expect(point.latencyMs).toBeGreaterThan(0);
      expect(['compute', 'off-chip-bandwidth', 'feedback-loop-timing']).toContain(point.bottleneck);
    }
  });

  it('recommends a bounded, square-ish tile that is at least as good as the configured tile', () => {
    const recommendation = recommendTile(DEFAULT_ACCELERATOR_ARCHITECTURE_INPUT);
    const baseline = evaluateAcceleratorArchitecture(DEFAULT_ACCELERATOR_ARCHITECTURE_INPUT);

    expect(recommendation.rows).toBeGreaterThanOrEqual(4);
    expect(recommendation.rows).toBeLessThanOrEqual(DEFAULT_ACCELERATOR_ARCHITECTURE_INPUT.arrayRows);
    expect(recommendation.columns).toBeGreaterThanOrEqual(4);
    expect(recommendation.columns).toBeLessThanOrEqual(DEFAULT_ACCELERATOR_ARCHITECTURE_INPUT.arrayColumns);
    expect(recommendation.utilizationPct).toBeGreaterThanOrEqual(baseline.arrayUtilizationPct);
    expect(recommendation.rationale).toMatch(/candidate tiles/i);

    const boundedInput = { ...DEFAULT_ACCELERATOR_ARCHITECTURE_INPUT, arrayRows: 13, arrayColumns: 29 };
    const bounded = recommendTile(boundedInput);
    expect(bounded.rows).toBeGreaterThanOrEqual(4);
    expect(bounded.rows).toBeLessThanOrEqual(13);
    expect(bounded.columns).toBeGreaterThanOrEqual(4);
    expect(bounded.columns).toBeLessThanOrEqual(29);
    expect(bounded.utilizationPct).toBeGreaterThanOrEqual(evaluateAcceleratorArchitecture(boundedInput).arrayUtilizationPct);
  });

  it('classifies workloads against the roofline ridge point', () => {
    const computeBound = classifyRoofline(DEFAULT_ACCELERATOR_ARCHITECTURE_INPUT);
    expect(computeBound.region).toBe('compute-bound');
    expect(computeBound.ridgePointOpsPerByte).toBeGreaterThan(0);
    expect(computeBound.intensityOpsPerByte).toBeGreaterThan(0);
    expect(computeBound.note).toMatch(/ridge point/i);

    const memoryBound = classifyRoofline({
      ...DEFAULT_ACCELERATOR_ARCHITECTURE_INPUT,
      offChipBandwidthGBps: 0.1,
    });
    expect(memoryBound.region).toBe('memory-bound');

    const balanced = classifyRoofline({
      ...DEFAULT_ACCELERATOR_ARCHITECTURE_INPUT,
      offChipBandwidthGBps: 50,
    });
    expect(balanced.region).toBe('balanced');
  });
});

describe('MAC array Verilog skeleton', () => {
  it('emits a parameterized array with generate loops and a mac submodule', () => {
    const verilog = generateMacArrayVerilog({ ...DEFAULT_MAC_ARRAY, moduleName: 'tile_array' });

    expect(verilog).toContain('module tile_array #(');
    expect(verilog).toContain('parameter ROWS');
    expect(verilog).toContain('parameter COLS');
    expect(verilog).toContain('parameter DATA_WIDTH');
    expect(verilog).toContain('parameter ACC_WIDTH');
    expect(verilog).toContain('valid_in');
    expect(verilog).toContain('valid_out');
    expect(verilog).toContain('module mac #(');
    expect(verilog).toMatch(/begin\s*:\s*[A-Za-z_][A-Za-z0-9_]*/);
    expect(verilog).toContain('endgenerate');
    expect(verilog).toContain('endmodule');
  });

  it('sanitizes hostile module names instead of emitting them', () => {
    const hostile = generateMacArrayVerilog({ ...DEFAULT_MAC_ARRAY, moduleName: '; endmodule //' });

    expect(hostile).not.toContain('; endmodule //');
    expect(hostile).toMatch(/module [A-Za-z_][A-Za-z0-9_]* #\(/);
    expect(generateMacArrayVerilog({ ...DEFAULT_MAC_ARRAY, moduleName: '' })).toContain('module mac_array #(');
    expect(generateMacArrayVerilog({ ...DEFAULT_MAC_ARRAY, moduleName: '9tile' })).toContain('module m_9tile #(');
  });
});
