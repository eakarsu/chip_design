/**
 * @jest-environment node
 */
import { POST } from '../../app/api/layer-bool/route';

function jsonReq(body: unknown): Request {
  return new Request('http://t/api/layer-bool', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('/api/layer-bool', () => {
  it('does AND', async () => {
    const res = await POST(jsonReq({
      op: 'and',
      a: [{ x1: 0, y1: 0, x2: 10, y2: 10 }],
      b: [{ x1: 5, y1: 5, x2: 15, y2: 15 }],
    }) as never);
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.area).toBeCloseTo(25, 6);
  });

  it('does SIZE', async () => {
    const res = await POST(jsonReq({
      op: 'size',
      a: [{ x1: 0, y1: 0, x2: 1, y2: 1 }],
      delta: 1,
    }) as never);
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.area).toBe(9);
  });

  it('400s on invalid op', async () => {
    const res = await POST(jsonReq({ op: 'mul', a: [] }) as never);
    expect(res.status).toBe(400);
  });

  it('400s on missing a', async () => {
    const res = await POST(jsonReq({ op: 'and' }) as never);
    expect(res.status).toBe(400);
  });
});
