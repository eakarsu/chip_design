/**
 * @jest-environment node
 */
import { POST } from '../../app/api/xsection/route';
import { defaultStackup } from '@/lib/tools/xsection';

function jsonReq(body: unknown): Request {
  return new Request('http://t/api/xsection', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('/api/xsection', () => {
  it('returns slabs for a valid request', async () => {
    const res = await POST(jsonReq({
      stack: defaultStackup(),
      rects: [{ layer: 'M1', x: 0, y: 0, width: 5, height: 1 }],
      axis: 'x', at: 0.5,
    }) as never);
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.slabs.length).toBe(1);
    expect(j.layersHit).toEqual(['M1']);
  });

  it('400s on missing axis', async () => {
    const res = await POST(jsonReq({
      stack: defaultStackup(), rects: [], at: 0,
    }) as never);
    expect(res.status).toBe(400);
  });
});
