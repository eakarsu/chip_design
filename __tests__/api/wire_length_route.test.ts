/**
 * @jest-environment node
 */
import { POST } from '../../app/api/wire-length/route';

function jsonReq(body: unknown): Request {
  return new Request('http://t/api/wire-length', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('/api/wire-length', () => {
  it('returns the HPWL report', async () => {
    const res = await POST(jsonReq({
      nets: [
        { name: 'n1', terminals: [{ x: 0, y: 0 }, { x: 4, y: 3 }] },
        { name: 'n2', terminals: [{ x: 0, y: 0 }, { x: 1, y: 1 }] },
      ],
    }) as never);
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.totalHpwl).toBe(7 + 2);
    expect(j.perNet.length).toBe(2);
  });

  it('400s when nets is missing', async () => {
    const res = await POST(jsonReq({}) as never);
    expect(res.status).toBe(400);
  });

  it('400s on invalid JSON', async () => {
    const r = new Request('http://t/api/wire-length', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: 'not json',
    });
    const res = await POST(r as never);
    expect(res.status).toBe(400);
  });
});
