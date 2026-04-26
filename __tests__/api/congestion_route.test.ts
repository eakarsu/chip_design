/**
 * @jest-environment node
 */
import { POST } from '../../app/api/openroad/congestion/route';

function jsonReq(body: unknown): Request {
  return new Request('http://t/api/openroad/congestion', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('/api/openroad/congestion', () => {
  it('parses a stdout payload', async () => {
    const stdout = `
GCell (0, 0) H: used/cap = 12/16 V: used/cap = 8/16
metal2   12345    6000    48.6%    5 / 8
`;
    const res = await POST(jsonReq({ stdout }) as never);
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.tiles).toHaveLength(1);
    expect(j.layers).toHaveLength(1);
    expect(j.peakUsage).toBeCloseTo(12 / 16, 3);
  });

  it('400s on missing stdout', async () => {
    const res = await POST(jsonReq({}) as never);
    expect(res.status).toBe(400);
  });
});
