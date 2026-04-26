/** @jest-environment node */
import { POST } from '../../app/api/ldo-psrr/route';
const req = (b: unknown) => new Request('http://t', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify(b),
});
describe('/api/ldo-psrr', () => {
  it('returns PSRR sweep', async () => {
    const r = await POST(req({
      A0: 1000, fp1: 100, esr: 0.05, cout: 1e-6,
      beta: 0.5, gmp: 1e-3, iload: 0.05,
    }) as never);
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.samples.length).toBeGreaterThan(0);
    expect(j.fAtTarget).toBeGreaterThan(0);
  });
  it('400s on missing', async () => {
    const r = await POST(req({}) as never);
    expect(r.status).toBe(400);
  });
});
