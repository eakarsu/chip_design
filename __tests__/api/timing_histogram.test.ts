/**
 * @jest-environment node
 */
import { POST } from '../../app/api/timing/histogram/route';

function jsonReq(body: unknown): Request {
  return new Request('http://t/api/timing/histogram', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('/api/timing/histogram', () => {
  it('bins a flat slack array', async () => {
    const res = await POST(jsonReq({ slacks: [-0.5, -0.1, 0.2, 1.0], bins: 4 }) as never);
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.total).toBe(4);
    expect(j.violated).toBe(2);
    expect(j.bins).toHaveLength(4);
  });

  it('400s when nothing is provided', async () => {
    const res = await POST(jsonReq({}) as never);
    expect(res.status).toBe(400);
  });
});
