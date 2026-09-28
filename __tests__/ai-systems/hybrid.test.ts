/** @jest-environment node */
import { hybridPipelineInputSchema, planHybridPipeline } from '@/lib/ai-systems/hybrid';

const stages = [
  { id: 'memory-preparation' as const, opCount: 1e9, bytesMoved: 4e9 },
  { id: 'relevance-scoring' as const, opCount: 2e9, bytesMoved: 2e9 },
  { id: 'top-k-retrieval' as const, opCount: 5e8, bytesMoved: 1e9 },
  { id: 'attention' as const, opCount: 1e12, bytesMoved: 1e9 },
];

describe('ai-systems/hybrid GPU+FPGA pipeline planner', () => {
  it('splits stages by intensity against the GPU ridge point', () => {
    const result = planHybridPipeline({ stages, gpuHourlyUsd: 2.5, fpgaHourlyUsd: 1.5 });

    // ridge = 500e12 / 2000e9 = 250 ops/B.
    expect(result.gpuRidgeOpsPerByte).toBe(250);
    expect(result.assignmentRidgeOpsPerByte).toBe(250);
    expect(result.stages.map((stage) => stage.assignedDevice)).toEqual([
      'fpga',
      'fpga',
      'fpga',
      'gpu',
    ]);
    expect(result.stages.map((stage) => stage.classification)).toEqual([
      'memory-bound',
      'memory-bound',
      'memory-bound',
      'compute-bound',
    ]);
    expect(result.stages.map((stage) => stage.intensityOpsPerByte)).toEqual([0.25, 1, 0.5, 1000]);
  });

  it('spot-checks per-stage latency, pipeline totals and the GPU-only baseline', () => {
    const result = planHybridPipeline({ stages, gpuHourlyUsd: 2.5, fpgaHourlyUsd: 1.5 });
    const [prep, relevance, topK, attention] = result.stages;

    // prep: GPU max(1e9/5e14, 4e9/2e12) = 2 ms.
    // FPGA local max(1e9/2.5e13, 4e9/1e11) = 40 ms;
    // interconnect 5 us + 4e9/6.4e10 = 0.005 + 62.5 ms; total 102.505 ms.
    expect(prep.gpuLatencyMs).toBeCloseTo(2, 9);
    expect(prep.fpgaLocalLatencyMs).toBeCloseTo(40, 9);
    expect(prep.fpgaInterconnectLatencyMs).toBeCloseTo(62.505, 9);
    expect(prep.fpgaLatencyMs).toBeCloseTo(102.505, 9);
    expect(prep.latencyMs).toBeCloseTo(102.505, 9);

    // relevance: GPU 1 ms; FPGA local 20 ms + (0.005 + 31.25) = 51.255 ms.
    expect(relevance.latencyMs).toBeCloseTo(51.255, 9);
    // top-K: GPU 0.5 ms; FPGA local 10 ms + (0.005 + 15.625) = 25.63 ms.
    expect(topK.latencyMs).toBeCloseTo(25.63, 9);
    // attention: GPU max(2 ms, 0.5 ms) = 2 ms.
    expect(attention.latencyMs).toBeCloseTo(2, 9);

    expect(result.hybridLatencyMs).toBeCloseTo(181.39, 6);
    expect(result.gpuOnlyLatencyMs).toBeCloseTo(5.5, 6);
    expect(result.latencySpeedup).toBeCloseTo(5.5 / 181.39, 5);
    expect(result.hybridFasterThanGpuOnly).toBe(false);
    expect(result.bottleneckStageId).toBe('memory-preparation');
  });

  it('spot-checks energy and hourly cost against a hand calculation', () => {
    const result = planHybridPipeline({ stages, gpuHourlyUsd: 2.5, fpgaHourlyUsd: 1.5 });
    const prep = result.stages[0];
    // GPU: 1e9*2e-12 + 4e9*2e-11 = 0.082 J.
    expect(prep.gpuEnergyJ).toBeCloseTo(0.082, 9);
    // FPGA: 1e9*5e-12 + 4e9*5e-11 + 4e9*10e-12 = 0.245 J.
    expect(prep.fpgaEnergyJ).toBeCloseTo(0.245, 9);
    expect(prep.energyJ).toBeCloseTo(0.245, 9);

    // Duty weighting: 2.5 * (2/181.39) + 1.5 * (179.39/181.39) = 1.511026.
    expect(result.gpuDutyFraction + result.fpgaDutyFraction).toBeCloseTo(1, 6);
    expect(result.hybridCostPerHourUsd).toBeCloseTo(1.511026, 5);
    expect(result.gpuOnlyCostPerHourUsd).toBe(2.5);
    expect(result.hybridReservedCostPerHourUsd).toBe(4);
    expect(result.costSavingPct).toBeCloseTo(100 * (1 - 1.511026 / 2.5), 2);
    expect(result.costPerMillionTokensUsd).toBeCloseTo(
      result.hybridCostPerHourUsd / (result.tokensPerHour / 1e6),
      4
    );
  });

  it('can beat the GPU-only baseline when FPGA memory and interconnect are fast', () => {
    const result = planHybridPipeline({
      stages,
      fpgaMemoryBandwidthGBps: 5000,
      interconnectKind: 'pcie',
      interconnectLatencyUs: 5,
      interconnectBandwidthGBps: 4000,
      gpuHourlyUsd: 2.5,
      fpgaHourlyUsd: 1.5,
    });
    // prep: FPGA local 0.8 ms + interconnect (0.005 + 1) = 1.805 ms < 2 ms GPU.
    expect(result.stages[0].latencyMs).toBeCloseTo(1.805, 6);
    expect(result.hybridLatencyMs).toBeCloseTo(5.165, 6);
    expect(result.gpuOnlyLatencyMs).toBeCloseTo(5.5, 6);
    expect(result.latencySpeedup).toBeGreaterThan(1);
    expect(result.hybridFasterThanGpuOnly).toBe(true);
  });

  it('resolves inter-instance interconnect defaults', () => {
    const result = planHybridPipeline({
      stages,
      interconnectKind: 'inter-instance',
      gpuHourlyUsd: 2.5,
      fpgaHourlyUsd: 1.5,
    });
    expect(result.interconnectKind).toBe('inter-instance');
    expect(result.interconnectLatencyUs).toBe(100);
    expect(result.interconnectBandwidthGBps).toBe(12.5);
    expect(result.interconnectEnergyPjPerByte).toBe(30);
    // FPGA stage latency is exactly local + interconnect.
    for (const stage of result.stages.filter((item) => item.assignedDevice === 'fpga')) {
      expect(stage.latencyMs).toBeCloseTo(
        stage.fpgaLocalLatencyMs + stage.fpgaInterconnectLatencyMs,
        6
      );
    }
  });

  it('honors an explicit assignment ridge override', () => {
    const result = planHybridPipeline({
      stages,
      assignmentRidgeOpsPerByte: 0.5,
      gpuHourlyUsd: 2.5,
      fpgaHourlyUsd: 1.5,
    });
    expect(result.assignmentRidgeOpsPerByte).toBe(0.5);
    expect(result.stages.map((stage) => stage.assignedDevice)).toEqual([
      'fpga',
      'gpu',
      'gpu',
      'gpu',
    ]);
  });

  it('rejects zero, negative and malformed stage lists through zod', () => {
    const valid = { stages, gpuHourlyUsd: 2.5, fpgaHourlyUsd: 1.5 };
    expect(hybridPipelineInputSchema.safeParse(valid).success).toBe(true);
    expect(
      hybridPipelineInputSchema.safeParse({ ...valid, stages: stages.slice(0, 3) }).success
    ).toBe(false);
    expect(
      hybridPipelineInputSchema.safeParse({
        ...valid,
        stages: [...stages.slice(0, 3), stages[0]],
      }).success
    ).toBe(false);
    expect(
      hybridPipelineInputSchema.safeParse({
        ...valid,
        stages: stages.map((stage, index) =>
          index === 0 ? { ...stage, opCount: 0 } : stage
        ),
      }).success
    ).toBe(false);
    expect(
      hybridPipelineInputSchema.safeParse({
        ...valid,
        stages: stages.map((stage, index) =>
          index === 0 ? { ...stage, bytesMoved: -1 } : stage
        ),
      }).success
    ).toBe(false);
    expect(hybridPipelineInputSchema.safeParse({ ...valid, gpuHourlyUsd: 0 }).success).toBe(false);
    expect(hybridPipelineInputSchema.safeParse({ ...valid, fpgaHourlyUsd: -1 }).success).toBe(
      false
    );
    expect(
      hybridPipelineInputSchema.safeParse({
        ...valid,
        stages: [...stages.slice(0, 3), { ...stages[3], id: 'not-a-stage' }],
      }).success
    ).toBe(false);
  });

  it('always carries assumptions, limitations and the estimate label', () => {
    const result = planHybridPipeline({ stages, gpuHourlyUsd: 2.5, fpgaHourlyUsd: 1.5 });
    expect(result.label).toBe('analytical-estimate');
    expect(result.assumptions.length).toBeGreaterThan(0);
    expect(result.limitations.length).toBeGreaterThan(0);
    expect(result.limitations.join(' ')).toMatch(/not a simulator|not guaranteed/i);
  });
});
