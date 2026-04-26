/** @jest-environment node */
import { POST } from '../../app/api/gm-id/route';
const req = (b: unknown) => new Request('http://t', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify(b),
});
describe('/api/gm-id', () => {
  it('returns sizing', async () => {
    const r = await POST(req({
      gmTarget: 1e-3, region: 'moderate', uCox: 250e-6, L: 60e-9,
    }) as never);
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.Id).toBeGreaterThan(0);
    expect(j.W).toBeGreaterThan(0);
  });
  it('400s on missing', async () => {
    const r = await POST(req({}) as never);
    expect(r.status).toBe(400);
  });
});
