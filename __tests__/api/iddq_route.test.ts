/** @jest-environment node */
import { POST } from '../../app/api/iddq/route';
const req = (b: unknown) => new Request('http://t', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify(b),
});
describe('/api/iddq', () => {
  it('flags failing vectors', async () => {
    const r = await POST(req({
      vectors: [
        { name: 'v0', iddqUa: 1.0 }, { name: 'v1', iddqUa: 1.05 },
        { name: 'v2', iddqUa: 1.1 }, { name: 'v3', iddqUa: 50 },
      ],
      baselineN: 3, k: 4,
    }) as never);
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.failing).toBeGreaterThanOrEqual(1);
  });
  it('400s on missing', async () => {
    const r = await POST(req({}) as never);
    expect(r.status).toBe(400);
  });
});
