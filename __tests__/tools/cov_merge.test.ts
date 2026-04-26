import { mergeCoverage } from '@/lib/tools/cov_merge';

describe('mergeCoverage', () => {
  it('sums hit counts across DBs', () => {
    const r = mergeCoverage({
      dbs: [
        { name: 'a', bins: { 'cpu.alu.add': 2, 'cpu.alu.sub': 0 } },
        { name: 'b', bins: { 'cpu.alu.add': 1, 'cpu.alu.sub': 3 } },
      ],
    });
    expect(r.merged['cpu.alu.add']).toBe(3);
    expect(r.merged['cpu.alu.sub']).toBe(3);
    expect(r.totalBins).toBe(2);
    expect(r.covered).toBe(2);
    expect(r.coverage).toBeCloseTo(1, 6);
  });

  it('groups by leading module name', () => {
    const r = mergeCoverage({
      dbs: [
        { name: 'd', bins: { 'cpu.x': 1, 'cpu.y': 0, 'mem.z': 1 } },
      ],
    });
    const cpu = r.byModule.find(b => b.module === 'cpu')!;
    const mem = r.byModule.find(b => b.module === 'mem')!;
    expect(cpu.total).toBe(2);
    expect(cpu.covered).toBe(1);
    expect(mem.coverage).toBe(1);
  });

  it('reports unique-hit contribution per DB', () => {
    const r = mergeCoverage({
      dbs: [
        { name: 'a', bins: { 'x': 1, 'y': 0, 'z': 1 } },
        { name: 'b', bins: { 'x': 0, 'y': 1, 'z': 1 } },
      ],
    });
    // a hits {x,z}; only x is unique to a (b's x is 0)
    // b hits {y,z}; only y is unique to b (a's y is 0)
    expect(r.perDbUnique.find(p => p.name === 'a')!.uniqueHits).toBe(1);
    expect(r.perDbUnique.find(p => p.name === 'b')!.uniqueHits).toBe(1);
  });

  it('throws on negative hits', () => {
    expect(() => mergeCoverage({
      dbs: [{ name: 'x', bins: { a: -1 } }],
    })).toThrow();
  });
});
