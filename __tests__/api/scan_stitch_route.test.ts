/** @jest-environment node */
import { POST } from '../../app/api/scan-stitch/route';
const req = (b: unknown) => new Request('http://t', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify(b),
});
describe('/api/scan-stitch', () => {
  it('returns scan chains', async () => {
    const r = await POST(req({
      flops: [
        { name: 'f0', x: 0, y: 0 }, { name: 'f1', x: 1, y: 0 },
        { name: 'f2', x: 2, y: 0 }, { name: 'f3', x: 3, y: 0 },
      ],
      numChains: 2,
    }) as never);
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.chains).toHaveLength(2);
  });
  it('400s on missing fields', async () => {
    const r = await POST(req({ flops: [] }) as never);
    expect(r.status).toBe(400);
  });
});
