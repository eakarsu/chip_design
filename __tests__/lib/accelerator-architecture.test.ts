/** @jest-environment node */

import {
  compareAcceleratorOrganizations,
  DEFAULT_ACCELERATOR_ARCHITECTURE_INPUT,
  evaluateAcceleratorArchitecture,
} from '@/lib/acceleratorArchitecture';

describe('accelerator architecture model', () => {
  it('calculates dense matrix work, peak compute and communication intensity from explicit inputs', () => {
    const result = evaluateAcceleratorArchitecture(DEFAULT_ACCELERATOR_ARCHITECTURE_INPUT, 'coarse-tpu');

    expect(result.matrixOperations).toBe(2 * 1024 * 1024 * 1024);
    expect(result.macUnits).toBe(64 * 64 * 4);
    expect(result.peakTops).toBeCloseTo(32.768, 3);
    expect(result.weightsFitLocally).toBe(true);
    expect(result.totalTrafficMib).toBe(3);
    expect(result.computeCommunicationRatio).toBeCloseTo(682.67, 2);
  });

  it('detects off-chip bandwidth and feedback-loop timing bottlenecks separately', () => {
    const bandwidthLimited = evaluateAcceleratorArchitecture({
      ...DEFAULT_ACCELERATOR_ARCHITECTURE_INPUT,
      offChipBandwidthGBps: 0.1,
      recurrenceDepthGates: 0,
    });
    expect(bandwidthLimited.bottleneck).toBe('off-chip-bandwidth');

    const recurrenceLimited = evaluateAcceleratorArchitecture({
      ...DEFAULT_ACCELERATOR_ARCHITECTURE_INPUT,
      clockGhz: 4,
      recurrenceDepthGates: 50,
    });
    expect(recurrenceLimited.recurrenceLimited).toBe(true);
    expect(recurrenceLimited.bottleneck).toBe('feedback-loop-timing');
    expect(recurrenceLimited.meetsLatency).toBe(false);
  });

  it('compares coarse, fine and splittable organizations without changing total MAC count', () => {
    const results = compareAcceleratorOrganizations({
      ...DEFAULT_ACCELERATOR_ARCHITECTURE_INPUT,
      matrixM: 70,
      matrixN: 70,
    });

    expect(results.map((item) => item.organization)).toEqual(['coarse-tpu', 'fine-gpu', 'splittable']);
    expect(new Set(results.map((item) => item.macUnits)).size).toBe(1);
    expect(results[1].arrayUtilizationPct).toBeGreaterThan(results[0].arrayUtilizationPct);
    expect(results[2].arrayUtilizationPct).toBeGreaterThanOrEqual(results[0].arrayUtilizationPct);
  });

  it('makes implementation and determinism assumptions explicit', () => {
    const fpga = evaluateAcceleratorArchitecture({
      ...DEFAULT_ACCELERATOR_ARCHITECTURE_INPUT,
      reconfigurationDays: 30,
      productionVolume: 500,
      memoryPolicy: 'cache',
    });
    expect(fpga.hardwareRecommendation).toBe('FPGA');
    expect(fpga.deterministicLatency).toBe(false);
    expect(fpga.assumptions.join(' ')).toMatch(/miss-rate distributions/i);

    const asic = evaluateAcceleratorArchitecture({
      ...DEFAULT_ACCELERATOR_ARCHITECTURE_INPUT,
      reconfigurationDays: 365,
      productionVolume: 1_000_000,
      memoryPolicy: 'scratchpad',
    });
    expect(asic.hardwareRecommendation).toBe('ASIC');
    expect(asic.deterministicLatency).toBe(true);
  });
});
