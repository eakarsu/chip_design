/** @jest-environment node */
import { POST } from '../../app/api/em-check/route';
const req = (b: unknown) => new Request('http://t', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify(b),
});
describe('/api/em-check', () => {
  it('returns reports', async () => {
    const r = await POST(req({
      segments: [{ name: 's', layer: 'M5', width: 1, length: 1, current: 0.0001 }],
      layers: [{ name: 'M5', thickness: 0.5, jmax: 1 }],
    }) as never);
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.reports.length).toBe(1);
  });
  it('400s on missing fields', async () => {
    const r = await POST(req({}) as never);
    expect(r.status).toBe(400);
  });
});
