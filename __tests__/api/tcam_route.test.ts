/** @jest-environment node */
import { POST } from '../../app/api/tcam/route';
const req = (b: unknown) => new Request('http://t', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify(b),
});
describe('/api/tcam', () => {
  it('returns tcam estimate', async () => {
    const r = await POST(req({
      entries: 1024, widthBits: 144, cellType: 'NOR_16T', techNm: 16,
    }) as never);
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.areaUm2).toBeGreaterThan(0);
    expect(j.searchEnergyPj).toBeGreaterThan(0);
  });
  it('400s on missing', async () => {
    const r = await POST(req({}) as never);
    expect(r.status).toBe(400);
  });
});
