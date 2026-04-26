/** @jest-environment node */
import { POST } from '../../app/api/jtag/route';
const req = (b: unknown) => new Request('http://t', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify(b),
});
describe('/api/jtag', () => {
  it('returns BSR length', async () => {
    const r = await POST(req({
      pins: [{ name: 'a', dir: 'bidir' }],
      tms: [0, 1],
    }) as never);
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.bsrLength).toBe(3);
  });
  it('400s on missing', async () => {
    const r = await POST(req({ pins: [] }) as never);
    expect(r.status).toBe(400);
  });
});
