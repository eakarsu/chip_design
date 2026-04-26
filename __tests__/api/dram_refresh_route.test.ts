/** @jest-environment node */
import { POST } from '../../app/api/dram-refresh/route';
const req = (b: unknown) => new Request('http://t', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify(b),
});
describe('/api/dram-refresh', () => {
  it('returns refresh plan', async () => {
    const r = await POST(req({
      banks: 8, rowsPerBank: 1024, colsPerRow: 1024, wordBits: 64,
      trfcNs: 200, tempC: 85, clockNs: 1,
    }) as never);
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.trefiNs).toBeGreaterThan(0);
  });
  it('400s on missing', async () => {
    const r = await POST(req({}) as never);
    expect(r.status).toBe(400);
  });
});
