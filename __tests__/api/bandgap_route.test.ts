/** @jest-environment node */
import { POST } from '../../app/api/bandgap/route';
const req = (b: unknown) => new Request('http://t', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify(b),
});
describe('/api/bandgap', () => {
  it('returns sweep + α', async () => {
    const r = await POST(req({ Tmin: 233, Tmax: 398, steps: 20 }) as never);
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.alpha).toBeGreaterThan(0);
    expect(j.samples.length).toBe(20);
  });
  it('400s on missing', async () => {
    const r = await POST(req({}) as never);
    expect(r.status).toBe(400);
  });
});
