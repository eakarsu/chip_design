/** @jest-environment node */
import { POST } from '../../app/api/ecc/route';
const req = (b: unknown) => new Request('http://t', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify(b),
});
describe('/api/ecc', () => {
  it('encodes data', async () => {
    const r = await POST(req({
      mode: 'encode', dataBits: 8, data: '165',
    }) as never);
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.codeword).toBeDefined();
    expect(j.p).toBeGreaterThan(0);
  });
  it('round-trips encode/decode', async () => {
    const enc = await (await POST(req({
      mode: 'encode', dataBits: 16, data: '48879',
    }) as never)).json();
    const dec = await (await POST(req({
      mode: 'decode', dataBits: 16, codeword: enc.codeword,
    }) as never)).json();
    expect(dec.data).toBe('48879');
    expect(dec.status).toBe('NO_ERROR');
  });
  it('400s on missing dataBits', async () => {
    const r = await POST(req({}) as never);
    expect(r.status).toBe(400);
  });
});
