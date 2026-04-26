/** @jest-environment node */
import { POST } from '../../app/api/stim-gen/route';
const req = (b: unknown) => new Request('http://t', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify(b),
});
describe('/api/stim-gen', () => {
  it('returns vectors', async () => {
    const r = await POST(req({
      fields: [{ name: 'op', width: 3 }],
      vectors: 8, seed: 1,
    }) as never);
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.vectors).toHaveLength(8);
  });
  it('400s on missing', async () => {
    const r = await POST(req({}) as never);
    expect(r.status).toBe(400);
  });
});
