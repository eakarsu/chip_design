/**
 * @jest-environment node
 */
import { POST } from '../../app/api/liberty/route';

function jsonReq(body: unknown): Request {
  return new Request('http://t/api/liberty', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('/api/liberty', () => {
  it('parses a small library', async () => {
    const res = await POST(jsonReq({
      source: 'library (l) { cell (c) { area : 1.0 ; pin (a) { direction : input ; } } }',
    }) as never);
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.library.cells).toHaveLength(1);
    expect(j.summary.cellCount).toBe(1);
  });

  it('400s on missing source', async () => {
    const res = await POST(jsonReq({}) as never);
    expect(res.status).toBe(400);
  });
});
