/** @jest-environment node */
import { POST } from '../../app/api/sram-planner/route';
const req = (b: unknown) => new Request('http://t', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify(b),
});
describe('/api/sram-planner', () => {
  it('returns plan', async () => {
    const r = await POST(req({
      capacityBits: 1 << 18, wordBits: 32, cellAreaUm2: 0.07,
      muxFactor: 4, targetAccessNs: 1.0,
    }) as never);
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.best.totalAreaUm2).toBeGreaterThan(0);
  });
  it('400s on missing', async () => {
    const r = await POST(req({}) as never);
    expect(r.status).toBe(400);
  });
});
