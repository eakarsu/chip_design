/** @jest-environment node */
import { POST } from '../../app/api/cdc/route';
const req = (b: unknown) => new Request('http://t', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify(b),
});
describe('/api/cdc', () => {
  it('returns reports', async () => {
    const r = await POST(req({
      signals: [{ name: 's', srcClk: 'clk_a', width: 1 }],
      crossings: [{ src: 's', dst: 'd', dstClk: 'clk_b', syncDepth: 2 }],
    }) as never);
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.reports).toHaveLength(1);
  });
  it('400s on missing', async () => {
    const r = await POST(req({}) as never);
    expect(r.status).toBe(400);
  });
});
