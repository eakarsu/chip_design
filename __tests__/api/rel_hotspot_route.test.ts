/** @jest-environment node */
import { POST } from '../../app/api/rel-hotspot/route';
const req = (b: unknown) => new Request('http://t', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify(b),
});
describe('/api/rel-hotspot', () => {
  it('returns score grid', async () => {
    const r = await POST(req({
      ir: { cols: 2, rows: 1, data: [3, 0] },
      em: { cols: 2, rows: 1, data: [4, 0] },
    }) as never);
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.scoreGrid.data[0]).toBe(5);
  });
  it('400s on missing', async () => {
    const r = await POST(req({}) as never);
    expect(r.status).toBe(400);
  });
});
