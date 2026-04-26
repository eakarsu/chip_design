/** @jest-environment node */
import { POST } from '../../app/api/aging/route';
const req = (b: unknown) => new Request('http://t', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify(b),
});
describe('/api/aging', () => {
  it('projects ΔVth', async () => {
    const r = await POST(req({
      alpha: 0.5, vgs: 0.8, tempK: 380, years: 10,
    }) as never);
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.dVth).toBeGreaterThan(0);
  });
  it('400s on missing', async () => {
    const r = await POST(req({}) as never);
    expect(r.status).toBe(400);
  });
});
