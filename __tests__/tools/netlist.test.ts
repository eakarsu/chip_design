import { parseNetlist, netlistToGraph, forceLayout } from '@/lib/tools/netlist';

const SIMPLE = `
module top(a, b, y);
  input a, b;
  output y;
  wire n1;
  AND2_X1 g1 (.A(a), .B(b), .Y(n1));
  INV_X1  g2 (.A(n1), .Y(y));
endmodule
`;

const FANOUT = `
module top(a, b, c, y);
  input a, b, c;
  output y;
  wire n1, n2;
  AND2_X1 g1 (.A(a), .B(b), .Y(n1));
  AND2_X1 g2 (.A(n1), .B(c), .Y(n2));
  INV_X1  g3 (.A(n2), .Y(y));
  // dangling buffer that consumes n1 → fan-out.
  BUF_X1  g4 (.A(n1), .Y(y));
endmodule
`;

describe('parseNetlist', () => {
  it('extracts module name + ports + wires', () => {
    const ast = parseNetlist(SIMPLE);
    expect(ast.module).toBe('top');
    expect(ast.inputs).toEqual(['a', 'b']);
    expect(ast.outputs).toEqual(['y']);
    expect(ast.wires).toEqual(['n1']);
  });

  it('extracts gate instances with port-net mapping', () => {
    const ast = parseNetlist(SIMPLE);
    expect(ast.instances).toHaveLength(2);
    const g1 = ast.instances.find(i => i.name === 'g1')!;
    expect(g1.cell).toBe('AND2_X1');
    expect(g1.connections).toEqual({ A: 'a', B: 'b', Y: 'n1' });
  });

  it('skips comments and ignores reserved keywords as cell types', () => {
    const v = `
      module top(a, y);
        input a;
        output y;          // a comment
        /* a block comment with module foo(...) */
        INV_X1 g1 (.A(a), .Y(y));
      endmodule
    `;
    const ast = parseNetlist(v);
    expect(ast.instances).toHaveLength(1);
  });
});

describe('netlistToGraph', () => {
  it('builds nodes for ports + cells', () => {
    const g = netlistToGraph(parseNetlist(SIMPLE));
    expect(g.nodes.find(n => n.id === 'a')?.kind).toBe('port');
    expect(g.nodes.find(n => n.id === 'g1')?.kind).toBe('cell');
    expect(g.nodes.find(n => n.id === 'g1')?.detail).toBe('AND2_X1');
  });

  it('connects gates that share a net', () => {
    const g = netlistToGraph(parseNetlist(SIMPLE));
    // n1 connects g1 and g2.
    const e = g.edges.find(e => e.net === 'n1');
    expect(e).toBeDefined();
    expect([e!.source, e!.target].sort()).toEqual(['g1', 'g2']);
  });

  it('records fan-out nets with multiple endpoints', () => {
    const g = netlistToGraph(parseNetlist(FANOUT));
    expect(g.nets['n1'].sort()).toEqual(['g1', 'g2', 'g4']);
  });
});

describe('forceLayout', () => {
  it('returns one position per node, all within the box', () => {
    const g = netlistToGraph(parseNetlist(SIMPLE));
    const pos = forceLayout(g, { width: 200, height: 100, iterations: 50, seed: 42 });
    expect(pos).toHaveLength(g.nodes.length);
    for (const p of pos) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(200);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(100);
    }
  });

  it('is deterministic for a given seed', () => {
    const g = netlistToGraph(parseNetlist(FANOUT));
    const a = forceLayout(g, { iterations: 30, seed: 7 });
    const b = forceLayout(g, { iterations: 30, seed: 7 });
    expect(a).toEqual(b);
  });
});
