/** @jest-environment node */
import { POST } from '../../app/api/spice-tb/route';
const req = (b: unknown) => new Request('http://t', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify(b),
});
describe('/api/spice-tb', () => {
  it('returns netlist', async () => {
    const r = await POST(req({
      dut: 'amp1', subcktPath: 'amp1.spi',
      pins: [{ name: 'in', net: 'vin' }, { name: 'out', net: 'vout' }],
      rails: [{ name: 'DD', node: 'vdd', volts: 1.0 }],
      sources: [{ name: 'IN', kind: 'dc', posNode: 'vin', negNode: '0', volts: 0.5 }],
      analyses: [{ kind: 'tran', tstep: 1e-12, tstop: 5e-9 }],
    }) as never);
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.netlist).toContain('Xamp1');
    expect(j.lines).toBeGreaterThan(0);
  });
  it('400s on missing', async () => {
    const r = await POST(req({}) as never);
    expect(r.status).toBe(400);
  });
});
