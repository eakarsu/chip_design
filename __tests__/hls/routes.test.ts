/** @jest-environment node */

import { POST as analyze } from '../../app/api/hls/analyze/route';
import { POST as estimate } from '../../app/api/hls/estimate/route';
import { POST as pragmas } from '../../app/api/hls/pragmas/route';
import { POST as rtl } from '../../app/api/hls/rtl/route';

function request(body: unknown): Request {
  return new Request('http://test/api/hls/endpoint', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const kernel = `
  void vecadd(int a[64], int b[64], int c[64], int N = 64) {
    for (int i = 0; i < N; i++) { c[i] = a[i] + b[i]; }
  }
`;

describe('/api/hls/analyze', () => {
  it('parses a kernel and labels the result as parse-only', async () => {
    const response = await analyze(request({ kernel }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.label).toBe('parsed restricted-C kernel IR (not synthesis evidence)');
    expect(body.note).toContain('no estimation, synthesis, simulation, or verification');
    expect(body.name).toBe('vecadd');
    expect(body.loops).toHaveLength(1);
    expect(body.loops[0]).toMatchObject({ id: 'loop_0', tripCount: 64 });
    expect(body.operations).toHaveLength(1);
    expect(body.subset.length).toBeGreaterThan(3);
  });

  it('honours explicit parameter bindings', async () => {
    const response = await analyze(request({ kernel, parameters: { N: 8 } }));
    const body = await response.json();
    expect(body.loops[0].tripCount).toBe(8);
    expect(body.parameters[0]).toMatchObject({ value: 8 });
  });

  it('answers 422 with a positioned parse error', async () => {
    const response = await analyze(request({ kernel: 'void k() { while (1) {} }' }));
    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error).toBe('Kernel parse failed');
    expect(body.errors[0]).toMatchObject({ code: 'unsupported', line: 1 });
    expect(body.errors[0].message).toContain('while');
  });

  it('answers 422 for an invalid body and for invalid JSON', async () => {
    const invalidBody = await analyze(request({ kernel, extra: true }));
    expect(invalidBody.status).toBe(422);
    expect((await invalidBody.json()).message).toContain('Unrecognized key');

    const badJson = await analyze(new Request('http://test/api/hls/analyze', { method: 'POST', body: '{nope' }));
    expect(badJson.status).toBe(422);
    expect((await badJson.json()).message).toContain('valid JSON');
  });
});

describe('/api/hls/pragmas', () => {
  it('enumerates, ranks and truncates the ranked list', async () => {
    const response = await pragmas(request({ kernel, limit: 3, options: { maxPoints: 64 } }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.label).toContain('analytical design-space enumeration');
    expect(body.designSpace.totalCombinations).toBe(27);
    expect(body.designSpace.sampled).toBe(false);
    expect(body.totalRanked).toBe(27);
    expect(body.ranked).toHaveLength(3);
    expect(body.designSpace.truncatedToLimit).toBe(true);
    expect(body.ranked[0].estimate.label).toBe('analytical estimate, not synthesis evidence');
    expect(body.note).toContain('not consumed by a commercial HLS tool');
  });

  it('rejects an out-of-range factor list with 422', async () => {
    const response = await pragmas(request({ kernel, options: { parallelFactors: [0] } }));
    expect(response.status).toBe(422);
    expect((await response.json()).message).toContain('parallelFactors');
  });
});

describe('/api/hls/estimate', () => {
  it('estimates an explicit design point', async () => {
    const response = await estimate(request({
      kernel,
      designPoint: [{ loopId: 'loop_0', parallelFactor: 4, unrollFactor: 2 }],
    }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.designPoint.pragmaKey).toBe('loop_0:p4,i1,u2,t1');
    expect(body.estimate.label).toBe('analytical estimate, not synthesis evidence');
    expect(body.estimate.latencyCycles).toBeGreaterThan(0);
    expect(body.estimate.assumptions.length).toBeGreaterThan(0);
    expect(body.note).toContain('no synthesis');
  });

  it('defaults to the identity pragma set', async () => {
    const response = await estimate(request({ kernel }));
    const body = await response.json();
    expect(body.designPoint.pragmaKey).toBe('loop_0:p1,i1,u1,t1');
  });

  it('answers 422 for an unknown loop id', async () => {
    const response = await estimate(request({ kernel, designPoint: [{ loopId: 'loop_9' }] }));
    expect(response.status).toBe(422);
    expect((await response.json()).message).toContain('unknown loopId "loop_9"');
  });
});

describe('/api/hls/rtl', () => {
  it('generates a labelled scaffold and skips tool runs when asked', async () => {
    const response = await rtl(request({ kernel, verify: false, designPoint: [{ loopId: 'loop_0', unrollFactor: 2 }] }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.label).toContain('not synthesis or verification evidence');
    expect(body.note).toContain('not been proven equivalent');
    expect(body.verification.performed).toBe(false);
    expect(body.verification.yosys).toBeNull();
    expect(body.verilog).toContain('NOT SYNTHESIS OR VERIFICATION EVIDENCE');
    expect(body.testbench).toContain('DOES NOT CHECK FUNCTIONAL EQUIVALENCE');
    expect(body.limits.emittedStates).toBeGreaterThan(2);
  });

  it('answers 422 for scaffold-limit violations and bad module names', async () => {
    const deep = `
      void deep(int a[4], int b[4], int c[4], int N = 4) {
        for (int i = 0; i < N; i++) {
          for (int j = 0; j < N; j++) {
            for (int k = 0; k < N; k++) { a[i] = a[i] + b[j] * c[k]; }
          }
        }
      }
    `;
    const limited = await rtl(request({
      kernel: deep,
      verify: false,
      maxStates: 16,
      designPoint: [
        { loopId: 'loop_0', parallelFactor: 4, unrollFactor: 4 },
        { loopId: 'loop_1', parallelFactor: 4, unrollFactor: 4 },
        { loopId: 'loop_2', parallelFactor: 4, unrollFactor: 4 },
      ],
    }));
    expect(limited.status).toBe(422);
    expect((await limited.json()).message).toContain('above the 16 limit');

    const badName = await rtl(request({ kernel, verify: false, moduleName: '2bad' }));
    expect(badName.status).toBe(422);
  });
});
