/** @jest-environment node */
import { POST } from '../../app/api/cacti-lite/route';
const req = (b: unknown) => new Request('http://t', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify(b),
});
describe('/api/cacti-lite', () => {
  it('returns geometry', async () => {
    const r = await POST(req({
      sizeBytes: 32 * 1024, lineBytes: 64, assoc: 4,
      addressBits: 48, techNm: 16,
    }) as never);
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.sets).toBe(128);
  });
  it('400s on missing', async () => {
    const r = await POST(req({}) as never);
    expect(r.status).toBe(400);
  });
});
