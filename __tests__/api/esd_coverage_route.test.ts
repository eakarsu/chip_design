/** @jest-environment node */
import { POST } from '../../app/api/esd-coverage/route';
const req = (b: unknown) => new Request('http://t', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify(b),
});
describe('/api/esd-coverage', () => {
  it('returns coverage', async () => {
    const r = await POST(req({
      pads: [{ name: 'p', domain: 'v', x: 0, y: 0 }],
      devices: [{ name: 'd', domain: 'v', x: 5, y: 0 }],
      maxDist: 10,
    }) as never);
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.uncovered).toBe(0);
  });
  it('422s on bad maxDist', async () => {
    const r = await POST(req({
      pads: [], devices: [], maxDist: 0,
    }) as never);
    expect(r.status).toBe(422);
  });
});
