/**
 * @jest-environment node
 */
import { POST } from '../../app/api/openroad/irdrop/route';

function jsonReq(body: unknown): Request {
  return new Request('http://t/api/openroad/irdrop', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('/api/openroad/irdrop', () => {
  it('parses a stdout payload', async () => {
    const stdout = `inst_1   metal4   0.895  0.005
Net VDD: max IR drop = 0.005 V at inst_1, mean = 0.005 V`;
    const res = await POST(jsonReq({ stdout }) as never);
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.instances).toHaveLength(1);
    expect(j.nets).toHaveLength(1);
    expect(j.worstDrop).toBeCloseTo(0.005, 5);
  });

  it('400s on missing stdout', async () => {
    const res = await POST(jsonReq({}) as never);
    expect(res.status).toBe(400);
  });
});
