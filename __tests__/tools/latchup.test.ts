import { checkLatchup } from '@/lib/tools/latchup';

describe('checkLatchup', () => {
  it('matches NMOS to nearest ptap, PMOS to nearest ntap', () => {
    const r = checkLatchup(
      [
        { name: 'n1', kind: 'nmos', x: 0, y: 0 },
        { name: 'p1', kind: 'pmos', x: 0, y: 0 },
      ],
      [
        { name: 'pt', kind: 'ptap', x: 5, y: 0 },
        { name: 'nt', kind: 'ntap', x: 6, y: 0 },
      ],
      10,
    );
    expect(r.reports[0].nearestTap).toBe('pt');
    expect(r.reports[1].nearestTap).toBe('nt');
    expect(r.failing).toBe(0);
  });

  it('flags devices farther than maxTapDist', () => {
    const r = checkLatchup(
      [{ name: 'n1', kind: 'nmos', x: 0, y: 0 }],
      [{ name: 'pt', kind: 'ptap', x: 100, y: 0 }],
      10,
    );
    expect(r.reports[0].ok).toBe(false);
    expect(r.failing).toBe(1);
  });

  it('warns when needed tap kind missing entirely', () => {
    const r = checkLatchup(
      [{ name: 'n', kind: 'nmos', x: 0, y: 0 }],
      [{ name: 'nt', kind: 'ntap', x: 0, y: 0 }],
      10,
    );
    expect(r.warnings.length).toBe(1);
  });

  it('throws on bad maxTapDist', () => {
    expect(() => checkLatchup([], [], 0)).toThrow();
  });
});
