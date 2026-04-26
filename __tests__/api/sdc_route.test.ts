/**
 * @jest-environment node
 */
import { POST } from '../../app/api/sdc/route';

function jsonReq(body: unknown): Request {
  return new Request('http://t/api/sdc', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('/api/sdc', () => {
  it('parses sdc text', async () => {
    const res = await POST(jsonReq({
      sdc: 'create_clock -name clk -period 10 [get_ports clk]',
    }) as never);
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.constraints.clocks).toHaveLength(1);
    expect(j.summary.fmaxMHz).toBe(100);
    expect(typeof j.emitted).toBe('string');
  });

  it('emits from constraints', async () => {
    const res = await POST(jsonReq({
      constraints: {
        clocks: [{ name: 'c', period: 5, source: null, waveform: [0, 2.5] }],
        generatedClocks: [], ioDelays: [], falsePaths: [], multicyclePaths: [],
        maxMinDelays: [], clockGroups: [], clockUncertainties: [],
        other: [], warnings: [],
      },
    }) as never);
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.emitted).toMatch(/create_clock/);
  });

  it('400s on missing inputs', async () => {
    const res = await POST(jsonReq({}) as never);
    expect(res.status).toBe(400);
  });
});
