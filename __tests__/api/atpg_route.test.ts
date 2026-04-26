/** @jest-environment node */
import { POST } from '../../app/api/atpg/route';
const req = (b: unknown) => new Request('http://t', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify(b),
});
describe('/api/atpg', () => {
  it('returns coverage', async () => {
    const r = await POST(req({
      pis: ['a', 'b'], pos: ['g1'],
      gates: [{ name: 'g1', op: 'and', inputs: ['a', 'b'] }],
      vectors: 16, seed: 1,
    }) as never);
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.coverage).toBeGreaterThan(0);
  });
  it('400s on missing', async () => {
    const r = await POST(req({}) as never);
    expect(r.status).toBe(400);
  });
});
