import { emitSpiceTb } from '@/lib/tools/spice_tb';
describe('emitSpiceTb', () => {
  it('emits a tran deck with sources and DUT', () => {
    const r = emitSpiceTb({
      dut: 'amp1', subcktPath: 'amp1.spi',
      pins: [{ name: 'in', net: 'vin' }, { name: 'out', net: 'vout' }],
      rails: [{ name: 'DD', node: 'vdd', volts: 1.0 }],
      sources: [
        { name: 'IN', kind: 'pwl', posNode: 'vin', negNode: '0',
          pts: [{ t: 0, v: 0 }, { t: 1e-9, v: 0.5 }] },
      ],
      analyses: [{ kind: 'tran', tstep: 1e-12, tstop: 5e-9 }],
      measures: [{ name: 'vp', expr: 'max v(vout)' }],
    });
    expect(r.netlist).toContain('Xamp1');
    expect(r.netlist).toContain('.tran');
    expect(r.netlist).toContain('.measure');
    expect(r.netlist).toContain('PWL(');
    expect(r.lines).toBeGreaterThan(5);
  });
  it('throws on missing fields', () => {
    expect(() => emitSpiceTb({
      dut: '', subcktPath: '', pins: [], rails: [],
      sources: [], analyses: [],
    })).toThrow();
  });
});
