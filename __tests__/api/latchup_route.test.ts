/** @jest-environment node */
import { POST } from '../../app/api/latchup/route';
const req = (b: unknown) => new Request('http://t', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify(b),
});
describe('/api/latchup', () => {
  it('returns reports', async () => {
    const r = await POST(req({
      devices: [{ name: 'n', kind: 'nmos', x: 0, y: 0 }],
      taps: [{ name: 'pt', kind: 'ptap', x: 1, y: 0 }],
      maxTapDist: 5,
    }) as never);
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.reports[0].ok).toBe(true);
  });
  it('400s on missing', async () => {
    const r = await POST(req({}) as never);
    expect(r.status).toBe(400);
  });
});
