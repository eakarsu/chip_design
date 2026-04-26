/**
 * @jest-environment node
 */
import { POST } from '../../app/api/gds/remap/route';

function jsonReq(body: unknown): Request {
  return new Request('http://t/api/gds/remap', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const lib = {
  libname: 'L', version: 600,
  units: { userPerDb: 1e-3, metersPerDb: 1e-9 },
  structures: [{
    name: 'TOP',
    elements: [
      { type: 'boundary', layer: 1, datatype: 0, points: [{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1},{x:0,y:0}] },
    ],
  }],
};

describe('/api/gds/remap', () => {
  it('remaps and reports', async () => {
    const res = await POST(jsonReq({
      lib,
      table: { rules: [{ fromLayer: 1, fromDatatype: 0, toLayer: 99, toDatatype: 0 }] },
    }) as never);
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.report.hits[0]).toBe(1);
    expect(j.histogram[0].layer).toBe(99);
  });

  it('400s on missing lib', async () => {
    const res = await POST(jsonReq({ table: { rules: [] } }) as never);
    expect(res.status).toBe(400);
  });

  it('422s on bad table', async () => {
    const res = await POST(jsonReq({ lib, table: { rules: [{ fromLayer: 'x' }] } }) as never);
    expect(res.status).toBe(422);
  });
});
