/** @jest-environment node */
import { POST } from '../../app/api/cov-merge/route';
const req = (b: unknown) => new Request('http://t', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify(b),
});
describe('/api/cov-merge', () => {
  it('returns merged coverage', async () => {
    const r = await POST(req({
      dbs: [{ name: 'a', bins: { x: 1, y: 0 } }],
    }) as never);
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.totalBins).toBe(2);
    expect(j.covered).toBe(1);
  });
  it('400s on missing', async () => {
    const r = await POST(req({}) as never);
    expect(r.status).toBe(400);
  });
});
