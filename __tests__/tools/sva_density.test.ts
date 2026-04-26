import { computeSvaDensity } from '@/lib/tools/sva_density';

describe('computeSvaDensity', () => {
  it('counts asserts/assumes/covers', () => {
    const r = computeSvaDensity({
      modules: [{
        name: 'cpu',
        source: [
          'module cpu;',
          '  assert property (@(posedge clk) a |-> b);',
          '  assume property (@(posedge clk) en);',
          '  cover property (@(posedge clk) c);',
          '  $cover(d);',
          'endmodule',
        ].join('\n'),
      }],
    });
    expect(r.totalAsserts).toBe(1);
    expect(r.totalAssumes).toBe(1);
    expect(r.totalCovers).toBe(2);
  });

  it('classifies low-density modules', () => {
    // 100 LOC, 0 asserts -> band low
    const lines = Array.from({ length: 100 }, (_, i) => `  x${i} = 1;`).join('\n');
    const r = computeSvaDensity({
      modules: [{ name: 'm', source: `module m;\n${lines}\nendmodule` }],
      lowPerKloc: 1,
    });
    expect(r.reports[0].band).toBe('low');
  });

  it('reports overall density', () => {
    const r = computeSvaDensity({
      modules: [
        { name: 'a', source: 'assert property (x);\nassert property (y);' },
      ],
    });
    expect(r.overallDensity).toBeGreaterThan(0);
  });
});
