/**
 * @jest-environment node
 */
import { POST } from '../../app/api/floorplan/def/route';
import { exampleFloorplan, blankFloorplan } from '@/lib/algorithms/floorplan';

function jsonReq(body: unknown): Request {
  return new Request('http://t/api/floorplan/def', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('/api/floorplan/def', () => {
  it('emits DEF text for a valid floorplan', async () => {
    const res = await POST(jsonReq({ floorplan: exampleFloorplan() }) as never);
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.def).toMatch(/DESIGN\s+demo_chip/);
    expect(j.def).toMatch(/COMPONENTS\s+\d+/);
  });

  it('422s on validation errors', async () => {
    const fp = blankFloorplan();
    fp.macros = [
      { name: 'a', master: 'X', x: 0, y: 0, width: 100, height: 100, halo: 0, orient: 'N', fixed: false },
      { name: 'b', master: 'X', x: 50, y: 50, width: 100, height: 100, halo: 0, orient: 'N', fixed: false },
    ];
    const res = await POST(jsonReq({ floorplan: fp }) as never);
    expect(res.status).toBe(422);
    const j = await res.json();
    expect(j.issues.some((i: { severity: string }) => i.severity === 'error')).toBe(true);
  });

  it('400s when floorplan is missing', async () => {
    const res = await POST(jsonReq({}) as never);
    expect(res.status).toBe(400);
  });
});
