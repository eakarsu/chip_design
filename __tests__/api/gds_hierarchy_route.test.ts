/**
 * @jest-environment node
 */
import { POST } from '../../app/api/gds/hierarchy/route';

function jsonReq(body: unknown): Request {
  return new Request('http://t/api/gds/hierarchy', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const lib = {
  libname: 'L', version: 600,
  units: { userPerDb: 1e-3, metersPerDb: 1e-9 },
  structures: [
    { name: 'TOP', elements: [{ type: 'sref', sname: 'A', origin: { x: 0, y: 0 } }] },
    { name: 'A', elements: [
      { type: 'boundary', layer: 1, datatype: 0, points: [
        { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }, { x: 0, y: 0 },
      ] },
    ] },
  ],
};

describe('/api/gds/hierarchy', () => {
  it('returns hierarchy + flattened counts', async () => {
    const res = await POST(jsonReq({ lib }) as never);
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.hierarchy.tops).toEqual(['TOP']);
    expect(j.flattened.find((c: { name: string }) => c.name === 'A')).toBeDefined();
  });

  it('400s on missing lib', async () => {
    const res = await POST(jsonReq({}) as never);
    expect(res.status).toBe(400);
  });
});
