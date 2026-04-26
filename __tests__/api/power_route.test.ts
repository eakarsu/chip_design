/**
 * @jest-environment node
 */
import { POST } from '../../app/api/openroad/power/route';

function jsonReq(body: unknown): Request {
  return new Request('http://t/api/openroad/power', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('/api/openroad/power', () => {
  it('parses + aggregates instances by cell', async () => {
    const stdout = `
Sequential             1.0e-3   2.0e-4   1.0e-5   1.21e-3
Combinational          5.0e-4   3.0e-4   2.0e-5   8.2e-4
inst_x cell=AND2 Internal=1e-4 Switching=2e-4 Leakage=1e-6 Total=3.001e-4
inst_y cell=AND2 Internal=2e-4 Switching=3e-4 Leakage=2e-6 Total=5.002e-4
`;
    const res = await POST(jsonReq({ stdout }) as never);
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.groups).toHaveLength(2);
    expect(j.byCell).toHaveLength(1);
    expect(j.byCell[0].name).toBe('AND2');
  });

  it('400s on missing stdout', async () => {
    const res = await POST(jsonReq({}) as never);
    expect(res.status).toBe(400);
  });
});
