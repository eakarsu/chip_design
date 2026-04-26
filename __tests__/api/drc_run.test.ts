/**
 * @jest-environment node
 *
 * Smoke tests for /api/drc/run.
 *
 * The route is a thin wrapper around runDrc, so we verify it round-trips a
 * valid deck + geometries to a populated report and rejects malformed input.
 */
import { POST } from '../../app/api/drc/run/route';

function jsonReq(body: unknown): Request {
  return new Request('http://t/api/drc/run', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('/api/drc/run', () => {
  it('returns violations for an obviously-failing deck', async () => {
    const res = await POST(jsonReq({
      deck: {
        name: 't', technology: 'tt',
        rules: [{ kind: 'min_width', layer: 'L1', min: 100 }],
      },
      geometries: [
        { id: 'a', layer: 'L1', rect: { xl: 0, yl: 0, xh: 10, yh: 10 } },
      ],
    }) as never);
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.violations).toHaveLength(1);
    expect(j.geometryCount).toBe(1);
  });

  it('400s on missing deck', async () => {
    const res = await POST(jsonReq({ geometries: [] }) as never);
    expect(res.status).toBe(400);
  });

  it('400s on missing geometries array', async () => {
    const res = await POST(jsonReq({
      deck: { name: 't', technology: 'tt', rules: [] },
    }) as never);
    expect(res.status).toBe(400);
  });

  it('400s on a malformed deck', async () => {
    const res = await POST(jsonReq({
      deck: { name: 't' /* missing technology + rules */ },
      geometries: [],
    }) as never);
    expect(res.status).toBe(400);
  });
});
