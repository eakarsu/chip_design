/**
 * @jest-environment node
 */
import { POST } from '../../app/api/density-fill/route';

function jsonReq(body: unknown): Request {
  return new Request('http://t/api/density-fill', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('/api/density-fill', () => {
  it('inserts fills and returns the report', async () => {
    const res = await POST(jsonReq({
      window: { x1: 0, y1: 0, x2: 20, y2: 20 },
      obstacles: [],
      targetDensity: 0.3,
      cellW: 1, cellH: 1, pitch: 2, minSpacing: 0.2, bins: 4,
    }) as never);
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(Array.isArray(j.fills)).toBe(true);
    expect(j.fills.length).toBeGreaterThan(0);
    expect(j.meanAfter).toBeGreaterThan(0);
  });

  it('400s on missing body fields', async () => {
    const res = await POST(jsonReq({}) as never);
    expect(res.status).toBe(400);
  });

  it('422s on bad geometry', async () => {
    const res = await POST(jsonReq({
      window: { x1: 0, y1: 0, x2: 0, y2: 0 },
      obstacles: [],
    }) as never);
    expect(res.status).toBe(422);
  });
});
