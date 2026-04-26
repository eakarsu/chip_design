import {
  parseCongestionReport, tilesToGrid, congestionColor,
} from '@/lib/tools/congestion_report';

describe('parseCongestionReport', () => {
  it('parses per-gcell rows', () => {
    const stdout = `
GCell (0, 0)  H: used/cap = 12/16  V: used/cap = 8/16
GCell (1, 0)  H: used/cap = 5/16   V: used/cap = 17/16
GCell (0, 1)  layer metal2 H: used/cap = 4/16 V: used/cap = 4/16
`;
    const r = parseCongestionReport(stdout);
    expect(r.tiles).toHaveLength(3);
    expect(r.cols).toBe(2);
    expect(r.rows).toBe(2);
    expect(r.peakUsage).toBeCloseTo(17 / 16, 3); // 1.0625 — overflow tile
    expect(r.tiles[2].layer).toBe('metal2');
  });

  it('parses per-layer summary rows', () => {
    const stdout = `
Layer    Resource    Demand    Usage    Max H/V
metal2   12345       6000      48.6%    5 / 8
metal3   8000        7800      97.5%    7 / 9
`;
    const r = parseCongestionReport(stdout);
    expect(r.layers).toHaveLength(2);
    expect(r.layers[0].layer).toBe('metal2');
    expect(r.layers[0].usage).toBeCloseTo(0.486, 3);
    expect(r.layers[1].maxV).toBe(9);
  });

  it('emits a warning when nothing is recognised', () => {
    const r = parseCongestionReport('hello world');
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it('tilesToGrid lays out (col,row) values correctly', () => {
    const stdout = `
GCell (0, 0) H: used/cap = 1/2 V: used/cap = 0/2
GCell (1, 0) H: used/cap = 2/2 V: used/cap = 0/2
GCell (0, 1) H: used/cap = 0/2 V: used/cap = 1/2
`;
    const r = parseCongestionReport(stdout);
    const g = tilesToGrid(r);
    expect(g.cols).toBe(2);
    expect(g.rows).toBe(2);
    expect(g.grid[0][0]).toBe(0.5);
    expect(g.grid[0][1]).toBe(1.0);
    expect(g.grid[1][0]).toBe(0.5);
  });

  it('congestionColor returns valid rgb()', () => {
    expect(congestionColor(0)).toMatch(/^rgb\(/);
    expect(congestionColor(1)).toMatch(/^rgb\(/);
  });
});
