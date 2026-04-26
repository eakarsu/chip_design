/** @jest-environment node */
import { POST } from '../../app/api/rtl-lint/route';
const req = (b: unknown) => new Request('http://t', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify(b),
});
describe('/api/rtl-lint', () => {
  it('returns violations', async () => {
    const r = await POST(req({
      source: 'always_ff @(posedge clk) begin\n  a = 1;\nend',
    }) as never);
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.errors).toBeGreaterThan(0);
  });
  it('400s on missing', async () => {
    const r = await POST(req({}) as never);
    expect(r.status).toBe(400);
  });
});
