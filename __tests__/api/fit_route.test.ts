/** @jest-environment node */
import { POST } from '../../app/api/fit/route';
const req = (b: unknown) => new Request('http://t', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify(b),
});
describe('/api/fit', () => {
  it('returns FIT', async () => {
    const r = await POST(req({
      useK: 358, stressK: 358,
      mechanisms: [{ name: 'NBTI', population: 1e6, baseFit: 1e-3, Ea: 0 }],
    }) as never);
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.totalFit).toBeGreaterThan(0);
  });
  it('400s on missing', async () => {
    const r = await POST(req({}) as never);
    expect(r.status).toBe(400);
  });
});
