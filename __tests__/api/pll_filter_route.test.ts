/** @jest-environment node */
import { POST } from '../../app/api/pll-filter/route';
const req = (b: unknown) => new Request('http://t', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify(b),
});
describe('/api/pll-filter', () => {
  it('returns filter components', async () => {
    const r = await POST(req({
      fref: 25e6, fvco: 2.5e9, fc: 250e3, pmDeg: 60,
      kvco: 500e6, icp: 100e-6,
    }) as never);
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.R).toBeGreaterThan(0);
    expect(j.C1).toBeGreaterThan(0);
    expect(j.C2).toBeGreaterThan(0);
  });
  it('400s on missing', async () => {
    const r = await POST(req({}) as never);
    expect(r.status).toBe(400);
  });
});
