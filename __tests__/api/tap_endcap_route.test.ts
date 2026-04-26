/**
 * @jest-environment node
 */
import { POST } from '../../app/api/tap-endcap/route';
import { exampleFloorplan, generateRows } from '@/lib/algorithms/floorplan';

function jsonReq(body: unknown): Request {
  return new Request('http://t/api/tap-endcap', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('/api/tap-endcap', () => {
  it('returns inserted components', async () => {
    const fp = exampleFloorplan();
    fp.rows = generateRows(fp, { site: 'unit', siteWidth: 0.46, rowHeight: 2.72 });
    const res = await POST(jsonReq({
      floorplan: fp,
      spec: {
        tapMaster: 'TAP', endcapMaster: 'CAP',
        tapPitch: 25, siteWidth: 0.46, tapWidth: 0.46, tapHeight: 2.72,
      },
    }) as never);
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.components.length).toBeGreaterThan(0);
    expect(j.totalEndcaps).toBeGreaterThan(0);
  });

  it('400s on missing floorplan', async () => {
    const res = await POST(jsonReq({}) as never);
    expect(res.status).toBe(400);
  });

  it('422s on bad spec', async () => {
    const fp = exampleFloorplan();
    fp.rows = generateRows(fp, { site: 'unit', siteWidth: 0.46, rowHeight: 2.72 });
    const res = await POST(jsonReq({
      floorplan: fp,
      spec: { tapMaster: 'T', endcapMaster: 'E',
        tapPitch: 0, siteWidth: 0.46, tapWidth: 0.46, tapHeight: 2.72 },
    }) as never);
    expect(res.status).toBe(422);
  });
});
