/** @jest-environment node */
import { POST } from '../../app/api/common-centroid/route';
const req = (b: unknown) => new Request('http://t', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify(b),
});
describe('/api/common-centroid', () => {
  it('returns layout', async () => {
    const r = await POST(req({ groups: 2, unitsPerGroup: 8 }) as never);
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.cells.length).toBeGreaterThan(0);
    expect(j.maxOffset).toBeLessThan(0.01);
  });
  it('400s on missing', async () => {
    const r = await POST(req({}) as never);
    expect(r.status).toBe(400);
  });
});
