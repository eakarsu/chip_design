import { parseVerilog, parseVerilogInt, expandNets, tryParseVerilog } from '@/lib/parsers/verilog';

describe('Verilog parser', () => {
  it('parses a minimal ANSI-style module', () => {
    const src = `
      module simple (input wire a, input wire b, output wire y);
        wire tmp;
        and g1 (tmp, a, b);
        assign y = tmp;
      endmodule
    `;
    const n = parseVerilog(src);
    expect(n.modules).toHaveLength(1);
    const m = n.modules[0];
    expect(m.name).toBe('simple');
    expect(m.ports.map(p => p.name)).toEqual(['a', 'b', 'y']);
    expect(m.ports.map(p => p.direction)).toEqual(['input', 'input', 'output']);
    expect(m.wires.map(w => w.name)).toContain('tmp');
    expect(m.instances).toHaveLength(1);
    expect(m.instances[0].type).toBe('and');
    expect(m.instances[0].isPrimitive).toBe(true);
    expect(m.instances[0].positional).toEqual(['tmp', 'a', 'b']);
    expect(m.assigns).toEqual([{ lhs: 'y', rhs: 'tmp' }]);
  });

  it('parses non-ANSI port style with later directions', () => {
    const src = `
      module legacy (a, b, y);
        input a;
        input b;
        output y;
        assign y = a & b;
      endmodule
    `;
    const n = parseVerilog(src);
    const m = n.modules[0];
    expect(m.ports.map(p => p.name)).toEqual(['a', 'b', 'y']);
    expect(m.ports.find(p => p.name === 'y')?.direction).toBe('output');
  });

  it('parses vectored ports and expands them', () => {
    const src = `
      module buf8 (input [7:0] d, output [7:0] q);
        assign q = d;
      endmodule
    `;
    const m = parseVerilog(src).modules[0];
    expect(m.ports[0].msb).toBe(7);
    expect(m.ports[0].lsb).toBe(0);
    const nets = expandNets(m);
    expect(nets.has('d[0]')).toBe(true);
    expect(nets.has('d[7]')).toBe(true);
    expect(nets.has('q[3]')).toBe(true);
  });

  it('parses named port connections on user-module instantiation', () => {
    const src = `
      module top (input clk, input d, output q);
        dff u1 (.clk(clk), .d(d), .q(q));
      endmodule
    `;
    const m = parseVerilog(src).modules[0];
    expect(m.instances[0].type).toBe('dff');
    expect(m.instances[0].isPrimitive).toBe(false);
    expect(m.instances[0].connections).toEqual([
      { port: 'clk', net: 'clk' },
      { port: 'd',   net: 'd'   },
      { port: 'q',   net: 'q'   },
    ]);
  });

  it('handles unconnected named ports like .q()', () => {
    const src = `
      module top (input clk);
        dff u1 (.clk(clk), .d(), .q());
      endmodule
    `;
    const m = parseVerilog(src).modules[0];
    const conns = m.instances[0].connections;
    expect(conns.find(c => c.port === 'd')?.net).toBeNull();
    expect(conns.find(c => c.port === 'q')?.net).toBeNull();
  });

  it('ignores comments and compiler directives', () => {
    const src = `
      // top-level comment
      \`timescale 1ns/1ps
      \`define FOO 1
      /* block
         comment */
      module m (input a, output y);
        assign y = ~a; // invert
      endmodule
    `;
    const n = parseVerilog(src);
    expect(n.modules).toHaveLength(1);
    expect(n.modules[0].assigns[0].rhs).toContain('a');
  });

  it('survives an unsupported always block by skipping it', () => {
    const src = `
      module seq (input clk, input d, output reg q);
        always @(posedge clk) begin
          q <= d;
        end
      endmodule
    `;
    const n = parseVerilog(src);
    const m = n.modules[0];
    expect(m.ports.map(p => p.name)).toEqual(['clk', 'd', 'q']);
    expect(n.warnings.some(w => w.includes('always'))).toBe(true);
  });

  it('parses multiple instances declared on the same line', () => {
    const src = `
      module m (input a, input b, input c, output x, output y);
        and g1 (x, a, b), g2 (y, b, c);
      endmodule
    `;
    const m = parseVerilog(src).modules[0];
    expect(m.instances.map(i => i.name)).toEqual(['g1', 'g2']);
  });

  it('parses verilog integer literals', () => {
    expect(parseVerilogInt('42')).toBe(42);
    expect(parseVerilogInt("4'b1010")).toBe(10);
    expect(parseVerilogInt("8'hFF")).toBe(255);
    expect(parseVerilogInt("32'h_DEAD_BEEF")).toBe(0xDEADBEEF);
    expect(parseVerilogInt("3'd5")).toBe(5);
    expect(parseVerilogInt("2'bxx")).toBeNull();
  });

  it('tryParseVerilog returns errors instead of throwing', () => {
    const src = `module broken (;`;
    const { netlist, errors } = tryParseVerilog(src);
    expect(errors.length).toBeGreaterThan(0);
    // Netlist is at least a valid shape.
    expect(Array.isArray(netlist.modules)).toBe(true);
  });
});
