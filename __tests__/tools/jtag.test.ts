import { buildJtag } from '@/lib/tools/jtag';

describe('buildJtag', () => {
  it('builds BSR with correct cell counts per pin direction', () => {
    const r = buildJtag({
      pins: [
        { name: 'in0',  dir: 'input' },
        { name: 'out0', dir: 'output' },
        { name: 'io0',  dir: 'bidir' },
      ],
      tms: [],
    });
    // 1 + 2 + 3
    expect(r.bsrLength).toBe(6);
    expect(r.bsr.filter(c => c.type === 'oe')).toHaveLength(2);
  });

  it('runs the TAP FSM through TLR → RTI → SDS → SIS → CIR → SIR', () => {
    const r = buildJtag({
      pins: [{ name: 'a', dir: 'input' }],
      tms: [0, 1, 1, 0, 0],
      start: 'TLR',
    });
    expect(r.trace.map(t => t.state)).toEqual(
      ['RTI', 'SDS', 'SIS', 'CIR', 'SIR'],
    );
    expect(r.finalState).toBe('SIR');
  });

  it('reports shift cycles equal to BSR length', () => {
    const r = buildJtag({
      pins: [
        { name: 'a', dir: 'input' }, { name: 'b', dir: 'input' },
      ],
      tms: [],
    });
    expect(r.extestShiftCycles).toBe(2);
    expect(r.sampleShiftCycles).toBe(2);
  });
});
