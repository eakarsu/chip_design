/** @jest-environment node */
import { POST } from '../../app/api/bist-wrap/route';
const req = (b: unknown) => new Request('http://t', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify(b),
});
describe('/api/bist-wrap', () => {
  it('returns wrapper plan', async () => {
    const r = await POST(req({
      memories: [{ name: 'a', width: 32, addrBits: 10 }],
    }) as never);
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.totalGates).toBeGreaterThan(0);
  });
  it('400s on missing', async () => {
    const r = await POST(req({}) as never);
    expect(r.status).toBe(400);
  });
});
