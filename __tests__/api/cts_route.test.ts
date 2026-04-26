/**
 * @jest-environment node
 */
import { POST } from '../../app/api/openroad/cts/route';

function jsonReq(body: unknown): Request {
  return new Request('http://t/api/openroad/cts', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('/api/openroad/cts', () => {
  it('parses a sample report', async () => {
    const stdout = `
Number of Sinks   = 2
Number of Buffers = 1
Max Skew  = 0.05 ns
root: r x=0 y=0
buffer: B parent=r x=0 y=10 delay=0.10
sink: s0 parent=B x=-5 y=20
sink: s1 parent=B x=5  y=20
`;
    const res = await POST(jsonReq({ stdout }) as never);
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.nodes).toHaveLength(4);
    expect(j.summary.numSinks).toBe(2);
    expect(j.analytics.computedSkew).toBe(0);
    expect(j.analytics.latencyBySink.s0).toBeCloseTo(0.10, 3);
  });

  it('400s on missing stdout', async () => {
    const res = await POST(jsonReq({}) as never);
    expect(res.status).toBe(400);
  });
});
