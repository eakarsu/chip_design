/**
 * @jest-environment node
 */
import { POST } from '../../app/api/pdn/route';
import { exampleSpec } from '@/lib/tools/pdn';

function jsonReq(body: unknown): Request {
  return new Request('http://t/api/pdn', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('/api/pdn', () => {
  it('generates PDN from a valid spec', async () => {
    const res = await POST(jsonReq({ spec: exampleSpec() }) as never);
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.metrics.rings).toBe(8);
    expect(j.def).toMatch(/SPECIALNETS/);
  });

  it('400s on missing spec', async () => {
    const res = await POST(jsonReq({}) as never);
    expect(res.status).toBe(400);
  });

  it('422s on degenerate spec', async () => {
    const bad = { ...exampleSpec(), core: { x1: 0, y1: 0, x2: 0, y2: 0 } };
    const res = await POST(jsonReq({ spec: bad }) as never);
    expect(res.status).toBe(422);
  });
});
