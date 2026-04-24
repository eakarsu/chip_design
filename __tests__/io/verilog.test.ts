/**
 * @jest-environment node
 */
import { parseVerilog } from '@/lib/io/verilog';

describe('io/verilog parser', () => {
  test('parses minimal gate-level module', () => {
    const src = `
      module top (a, b, y);
        input  a, b;
        output y;
        wire n0;
        AND2 u0 (.A(a), .B(b), .Y(n0));
        BUF  u1 (.A(n0), .Y(y));
      endmodule
    `;
    const r = parseVerilog(src);
    expect(r.moduleName).toBe('top');
    expect(r.cells.map(c => c.id).sort()).toEqual(['u0', 'u1']);
    // Each cell has its instance pins.
    const u0 = r.cells.find(c => c.id === 'u0')!;
    expect(u0.pins.map(p => p.name).sort()).toEqual(['A', 'B', 'Y']);
    expect(u0.pins.find(p => p.name === 'Y')!.direction).toBe('output');
    // Net 'n0' connects u0.Y -> u1.A.
    const n0 = r.nets.find(n => n.name === 'n0')!;
    expect(n0.pins).toEqual(expect.arrayContaining(['u0/Y', 'u1/A']));
  });

  test('strips comments before parsing', () => {
    const src = `
      // line comment
      /* block
         comment */
      module m (input wire a, output wire y);
        BUF u0 (.A(a), .Y(y));
      endmodule
    `;
    const r = parseVerilog(src);
    expect(r.moduleName).toBe('m');
    expect(r.cells).toHaveLength(1);
  });

  test('expands single bus declaration', () => {
    const src = `
      module m (a, y);
        input  [1:0] a;
        output       y;
        AND2 u0 (.A(a_0), .B(a_1), .Y(y));
      endmodule
    `;
    const r = parseVerilog(src);
    expect(r.ports.find(p => p.name === 'a')!.direction).toBe('input');
    const a0 = r.nets.find(n => n.name === 'a_0')!;
    const a1 = r.nets.find(n => n.name === 'a_1')!;
    expect(a0.pins).toContain('u0/A');
    expect(a1.pins).toContain('u0/B');
  });

  test('throws on missing module', () => {
    expect(() => parseVerilog('// nothing here')).toThrow(/module/);
  });
});
