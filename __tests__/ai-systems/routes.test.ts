/** @jest-environment node */
import { POST as postHmt, runtime as hmtRuntime } from '../../app/api/ai-systems/hmt/route';
import {
  POST as postQuantization,
  runtime as quantizationRuntime,
} from '../../app/api/ai-systems/quantization/route';
import { POST as postLut, runtime as lutRuntime } from '../../app/api/ai-systems/lut/route';
import {
  POST as postHybrid,
  runtime as hybridRuntime,
} from '../../app/api/ai-systems/hybrid/route';
import {
  POST as postMemoryTech,
  runtime as memoryTechRuntime,
} from '../../app/api/ai-systems/memory-tech/route';

const jsonRequest = (body: unknown) =>
  new Request('http://test.local/api/ai-systems', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const rawRequest = (body: string) =>
  new Request('http://test.local/api/ai-systems', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  });

const hmtBody = {
  modelDim: 4,
  layerCount: 2,
  sequenceLength: 8,
  sensoryTokens: 2,
  shortTermSlots: 1,
  longTermSlots: 1,
  compressionHiddenDim: 2,
  compressionPasses: 1,
  memoryBudgetMb: 0.001,
  energyPerOpJoules: 1e-12,
  bytesPerJoule: 1e9,
};

const hybridBody = {
  stages: [
    { id: 'memory-preparation', opCount: 1e9, bytesMoved: 4e9 },
    { id: 'relevance-scoring', opCount: 2e9, bytesMoved: 2e9 },
    { id: 'top-k-retrieval', opCount: 5e8, bytesMoved: 1e9 },
    { id: 'attention', opCount: 1e12, bytesMoved: 1e9 },
  ],
  gpuHourlyUsd: 2.5,
  fpgaHourlyUsd: 1.5,
};

const memoryTechBody = {
  featureSizeNm: 20,
  dieAreaMm2: 100,
  bandwidthGbPerSecond: 64,
  modelBytesPerToken: 1e9,
};

describe('ai-systems API routes', () => {
  it('uses the nodejs runtime for every route', () => {
    expect([hmtRuntime, quantizationRuntime, lutRuntime, hybridRuntime, memoryTechRuntime]).toEqual([
      'nodejs',
      'nodejs',
      'nodejs',
      'nodejs',
      'nodejs',
    ]);
  });

  it('POST /api/ai-systems/hmt returns the model with assumptions and limitations', async () => {
    const response = await postHmt(jsonRequest(hmtBody));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.label).toBe('analytical-estimate');
    expect(body.effectiveContextTokens).toBe(4);
    expect(Array.isArray(body.assumptions)).toBe(true);
    expect(body.assumptions.length).toBeGreaterThan(0);
    expect(Array.isArray(body.limitations)).toBe(true);
    expect(body.limitations.length).toBeGreaterThan(0);
  });

  it('POST /api/ai-systems/hmt rejects a negative modelDim with a readable 422', async () => {
    const response = await postHmt(jsonRequest({ ...hmtBody, modelDim: -1 }));
    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error).toBe('Invalid request');
    expect(body.message).toBe('Request validation failed');
    expect(body.issues[0].path).toBe('modelDim');
    expect(typeof body.issues[0].message).toBe('string');
  });

  it('POST /api/ai-systems/hmt returns 400 for invalid JSON', async () => {
    const response = await postHmt(rawRequest('{ not json'));
    expect(response.status).toBe(400);
  });

  it('POST /api/ai-systems/quantization returns a single scheme and a comparison mode', async () => {
    const single = await postQuantization(
      jsonRequest({ scheme: 'int8', weightCount: 1_000_000, activationElementsPerToken: 4096 })
    );
    expect(single.status).toBe(200);
    const singleBody = await single.json();
    expect(singleBody.scheme).toBe('int8');
    expect(singleBody.weightBytes).toBe(1_000_000);
    expect(singleBody.quality.modeled).toBe(false);
    expect(singleBody.assumptions.length).toBeGreaterThan(0);
    expect(singleBody.limitations.length).toBeGreaterThan(0);

    const comparison = await postQuantization(
      jsonRequest({ weightCount: 1_000_000, activationElementsPerToken: 4096 })
    );
    expect(comparison.status).toBe(200);
    const comparisonBody = await comparison.json();
    expect(comparisonBody.mode).toBe('comparison');
    expect(comparisonBody.schemes.map((row: { scheme: string }) => row.scheme)).toEqual([
      'fp16',
      'int8',
      'int4',
      'vq',
    ]);
    expect(comparisonBody.assumptions.length).toBeGreaterThan(0);
    expect(comparisonBody.limitations.length).toBeGreaterThan(0);
  });

  it('POST /api/ai-systems/quantization rejects zero counts and unknown schemes', async () => {
    const zeroWeights = await postQuantization(
      jsonRequest({ scheme: 'int8', weightCount: 0, activationElementsPerToken: 4096 })
    );
    expect(zeroWeights.status).toBe(422);
    const zeroBody = await zeroWeights.json();
    expect(zeroBody.issues[0].path).toBe('weightCount');

    const unknownScheme = await postQuantization(
      jsonRequest({ scheme: 'int2', weightCount: 10, activationElementsPerToken: 10 })
    );
    expect(unknownScheme.status).toBe(422);
    const unknownBody = await unknownScheme.json();
    expect(unknownBody.issues[0].path).toBe('scheme');
  });

  it('POST /api/ai-systems/lut returns table feasibility and rejects a zero SRAM budget', async () => {
    const ok = await postLut(
      jsonRequest({
        vectorDim: 8,
        subvectorDim: 4,
        codebookSize: 16,
        vectorsPerToken: 10,
        sramBudgetKb: 1,
        codebookEntryBytes: 1,
        lutEntryBytes: 1,
      })
    );
    expect(ok.status).toBe(200);
    const okBody = await ok.json();
    expect(okBody.feasible).toBe(true);
    expect(okBody.residentTableBytes).toBe(160);
    expect(okBody.assumptions.length).toBeGreaterThan(0);
    expect(okBody.limitations.length).toBeGreaterThan(0);

    const bad = await postLut(jsonRequest({ vectorDim: 8, sramBudgetKb: 0 }));
    expect(bad.status).toBe(422);
    const badBody = await bad.json();
    expect(badBody.issues[0].path).toBe('sramBudgetKb');
  });

  it('POST /api/ai-systems/hybrid returns a four-stage plan and rejects malformed stage lists', async () => {
    const ok = await postHybrid(jsonRequest(hybridBody));
    expect(ok.status).toBe(200);
    const okBody = await ok.json();
    expect(okBody.stages).toHaveLength(4);
    expect(okBody.stages.map((stage: { assignedDevice: string }) => stage.assignedDevice)).toEqual([
      'fpga',
      'fpga',
      'fpga',
      'gpu',
    ]);
    expect(okBody.assumptions.length).toBeGreaterThan(0);
    expect(okBody.limitations.length).toBeGreaterThan(0);

    const tooFew = await postHybrid(
      jsonRequest({ ...hybridBody, stages: hybridBody.stages.slice(0, 3) })
    );
    expect(tooFew.status).toBe(422);

    const duplicated = await postHybrid(
      jsonRequest({
        ...hybridBody,
        stages: [...hybridBody.stages.slice(0, 3), hybridBody.stages[0]],
      })
    );
    expect(duplicated.status).toBe(422);
    const duplicatedBody = await duplicated.json();
    expect(duplicatedBody.issues[0].path).toBe('stages');
    expect(duplicatedBody.issues[0].message).toMatch(/unique/);

    const zeroOps = await postHybrid(
      jsonRequest({
        ...hybridBody,
        stages: hybridBody.stages.map((stage, index) =>
          index === 0 ? { ...stage, opCount: 0 } : stage
        ),
      })
    );
    expect(zeroOps.status).toBe(422);
  });

  it('POST /api/ai-systems/memory-tech returns a projection and rejects missing bandwidth', async () => {
    const ok = await postMemoryTech(jsonRequest(memoryTechBody));
    expect(ok.status).toBe(200);
    const okBody = await ok.json();
    expect(okBody.tokensPerSecond).toBe(64);
    expect(okBody.projectionNotice).toMatch(/projection only/i);
    expect(okBody.assumptions.length).toBeGreaterThan(0);
    expect(okBody.limitations.length).toBeGreaterThan(0);

    const missingBandwidth = await postMemoryTech(
      jsonRequest({ featureSizeNm: 20, dieAreaMm2: 100, modelBytesPerToken: 1e9 })
    );
    expect(missingBandwidth.status).toBe(422);
    const missingBody = await missingBandwidth.json();
    expect(missingBody.issues[0].path).toBe('bandwidthGbPerSecond');

    const zeroFeature = await postMemoryTech(
      jsonRequest({ ...memoryTechBody, featureSizeNm: 0 })
    );
    expect(zeroFeature.status).toBe(422);
  });
});
