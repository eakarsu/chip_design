/** @jest-environment node */
import { POST } from '../../app/api/log-triage/route';
const req = (b: unknown) => new Request('http://t', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify(b),
});
describe('/api/log-triage', () => {
  it('triages log', async () => {
    const r = await POST(req({
      log: 'UVM_ERROR @ 100ns [X] boom\nUVM_ERROR @ 200ns [X] boom',
    }) as never);
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.bySeverity.UVM_ERROR).toBe(2);
  });
  it('400s on missing', async () => {
    const r = await POST(req({}) as never);
    expect(r.status).toBe(400);
  });
});
