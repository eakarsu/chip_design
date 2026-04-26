/**
 * @jest-environment node
 */
import { POST } from '../../app/api/wafer/route';

function jsonReq(body: unknown): Request {
  return new Request('http://t/api/wafer', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('/api/wafer', () => {
  it('computes DPW', async () => {
    const res = await POST(jsonReq({
      mode: 'dpw',
      spec: {
        waferDiameter: 300, edgeExclusion: 3,
        dieWidth: 10, dieHeight: 10, scribeWidth: 0.1,
      },
    }) as never);
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.grossDies).toBeGreaterThan(500);
  });

  it('packs reticle', async () => {
    const res = await POST(jsonReq({
      mode: 'reticle',
      spec: {
        reticleWidth: 26, reticleHeight: 33, gap: 0.1,
        dies: [{ name: 'a', width: 5, height: 5 }],
      },
    }) as never);
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.placements.length).toBe(1);
  });

  it('400s on missing mode', async () => {
    const res = await POST(jsonReq({}) as never);
    expect(res.status).toBe(400);
  });

  it('422s on bad spec', async () => {
    const res = await POST(jsonReq({
      mode: 'dpw',
      spec: { waferDiameter: 0, edgeExclusion: 0,
              dieWidth: 1, dieHeight: 1, scribeWidth: 0 },
    }) as never);
    expect(res.status).toBe(422);
  });
});
