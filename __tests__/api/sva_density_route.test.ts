/** @jest-environment node */
import { POST } from '../../app/api/sva-density/route';
const req = (b: unknown) => new Request('http://t', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify(b),
});
describe('/api/sva-density', () => {
  it('returns density', async () => {
    const r = await POST(req({
      modules: [{ name: 'm', source: 'assert property (x);' }],
    }) as never);
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.totalAsserts).toBe(1);
  });
  it('400s on missing', async () => {
    const r = await POST(req({}) as never);
    expect(r.status).toBe(400);
  });
});
