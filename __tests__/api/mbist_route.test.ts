/** @jest-environment node */
import { POST } from '../../app/api/mbist/route';
const req = (b: unknown) => new Request('http://t', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify(b),
});
describe('/api/mbist', () => {
  it('returns 10N MARCH cycles', async () => {
    const r = await POST(req({
      macros: [{ name: 'M0', depth: 1024, width: 32 }],
      clockNs: 1,
    }) as never);
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.totalCycles).toBe(10240);
  });
  it('400s on missing', async () => {
    const r = await POST(req({}) as never);
    expect(r.status).toBe(400);
  });
});
