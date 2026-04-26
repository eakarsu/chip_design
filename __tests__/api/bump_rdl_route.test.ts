/**
 * @jest-environment node
 */
import { POST } from '../../app/api/bump-rdl/route';

function jsonReq(body: unknown): Request {
  return new Request('http://t/api/bump-rdl', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('/api/bump-rdl', () => {
  it('returns a bump plan', async () => {
    const res = await POST(jsonReq({
      die: { xl: 0, yl: 0, xh: 1000, yh: 1000 },
      pitch: 200, diameter: 100, edgeKeepout: 100, pattern: 'grid',
      pads: [{ name: 'p', x: 0, y: 0 }],
    }) as never);
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.bumpCount).toBe(25);
    expect(j.assigned).toBe(1);
  });

  it('400s on missing die', async () => {
    const res = await POST(jsonReq({ pitch: 100, diameter: 50, pads: [] }) as never);
    expect(res.status).toBe(400);
  });

  it('422s on bad pitch', async () => {
    const res = await POST(jsonReq({
      die: { xl: 0, yl: 0, xh: 100, yh: 100 },
      pitch: -1, diameter: 50, edgeKeepout: 0, pattern: 'grid', pads: [],
    }) as never);
    expect(res.status).toBe(422);
  });
});
