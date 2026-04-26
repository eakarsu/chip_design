/**
 * @jest-environment node
 */
import { POST } from '../../app/api/pin-access/route';

function jsonReq(body: unknown): Request {
  return new Request('http://t/api/pin-access', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('/api/pin-access', () => {
  it('returns the access report', async () => {
    const res = await POST(jsonReq({
      pins: [{ name: 'A', layer: 'M2', x: 0, y: 0, width: 1, height: 1 }],
      tracks: [{ layer: 'M2', direction: 'h', offset: 0, step: 0.5 }],
    }) as never);
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.totalPins).toBe(1);
    expect(j.reports[0].hAccess).toBe(3);
  });

  it('400s on missing inputs', async () => {
    const res = await POST(jsonReq({}) as never);
    expect(res.status).toBe(400);
  });

  it('422s on bad track step', async () => {
    const res = await POST(jsonReq({
      pins: [],
      tracks: [{ layer: 'M2', direction: 'h', offset: 0, step: 0 }],
    }) as never);
    expect(res.status).toBe(422);
  });
});
