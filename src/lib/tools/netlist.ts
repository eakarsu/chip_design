/**
 * Structural-Verilog netlist parser → gate-graph.
 *
 * Post-synthesis netlists from Yosys (and friends) are structural Verilog:
 *
 *   module top(a, b, y);
 *     input  a, b;
 *     output y;
 *     wire   n1;
 *     AND2_X1 g1 (.A(a), .B(b), .Y(n1));
 *     INV_X1  g2 (.A(n1), .Y(y));
 *   endmodule
 *
 * We extract:
 *   - module name
 *   - input/output/inout port lists
 *   - wire names
 *   - instances: { name, cell, connections: { port → net } }
 *
 * From the instances we derive a graph:
 *   - nodes:  one per instance + one per top-level port
 *   - edges:  one per net connecting two or more endpoints
 *
 * The parser is intentionally narrow — handles common Yosys output, not
 * arbitrary RTL. It tolerates whitespace / line wrapping, and it does NOT
 * support complex expressions, bus slices, or generate blocks.
 */

export interface Instance {
  name: string;
  cell: string;
  connections: Record<string, string>;
}

export interface NetlistAst {
  module: string;
  inputs: string[];
  outputs: string[];
  inouts: string[];
  wires: string[];
  instances: Instance[];
}

export interface GraphNode {
  id: string;
  /** "port" for top-level ports, "cell" for gate instances. */
  kind: 'port' | 'cell';
  /** For cells: the gate type. For ports: 'input'|'output'|'inout'. */
  detail: string;
}

export interface GraphEdge {
  net: string;
  source: string;
  target: string;
}

export interface NetlistGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** net name → list of node ids that touch it. */
  nets: Record<string, string[]>;
}

/* -------------------------- Parser ------------------------------------ */

export function parseNetlist(verilog: string): NetlistAst {
  // Strip /* … */ and // … line comments.
  const src = verilog
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');

  const moduleMatch = src.match(/\bmodule\s+(\w+)\s*\(([^)]*)\)\s*;/);
  const module = moduleMatch ? moduleMatch[1] : '';

  const inputs: string[] = [];
  const outputs: string[] = [];
  const inouts: string[] = [];
  const wires: string[] = [];

  // input / output / inout / wire declarations — comma-separated names.
  const declRe = /\b(input|output|inout|wire)\b\s*(?:\[[^\]]*\])?\s*([^;]+);/g;
  let m: RegExpExecArray | null;
  while ((m = declRe.exec(src))) {
    const kind = m[1];
    const names = m[2].split(',').map(s => s.trim()).filter(Boolean);
    if (kind === 'input')  inputs.push(...names);
    if (kind === 'output') outputs.push(...names);
    if (kind === 'inout')  inouts.push(...names);
    if (kind === 'wire')   wires.push(...names);
  }

  // Instances: <CellType> <inst_name> ( .port(net), .port(net), ... );
  // Reserved keywords that look like CellType but aren't.
  const KEYWORDS = new Set(['input', 'output', 'inout', 'wire', 'reg', 'assign', 'parameter', 'module', 'endmodule', 'localparam']);
  const instances: Instance[] = [];

  // Use a permissive regex then validate.
  const instRe = /(\w+)\s+(\w+)\s*\(([\s\S]*?)\)\s*;/g;
  while ((m = instRe.exec(src))) {
    const cell = m[1];
    const name = m[2];
    if (KEYWORDS.has(cell)) continue;
    if (cell === module) continue;       // self-instantiation
    const inner = m[3];
    // Only count this as an instance if at least one .port(net) is present.
    if (!/\.\w+\s*\(/.test(inner)) continue;
    const connections: Record<string, string> = {};
    const portRe = /\.(\w+)\s*\(\s*([^)]*?)\s*\)/g;
    let pm: RegExpExecArray | null;
    while ((pm = portRe.exec(inner))) {
      // Strip whitespace from the net expression.
      connections[pm[1]] = pm[2].trim();
    }
    instances.push({ name, cell, connections });
  }

  return { module, inputs, outputs, inouts, wires, instances };
}

/* -------------------------- Graph builder ----------------------------- */

export function netlistToGraph(ast: NetlistAst): NetlistGraph {
  const nodes: GraphNode[] = [];
  const seen = new Set<string>();

  const pushNode = (n: GraphNode) => {
    if (seen.has(n.id)) return;
    seen.add(n.id);
    nodes.push(n);
  };

  // Top-level ports become graph nodes.
  for (const p of ast.inputs)  pushNode({ id: p, kind: 'port', detail: 'input' });
  for (const p of ast.outputs) pushNode({ id: p, kind: 'port', detail: 'output' });
  for (const p of ast.inouts)  pushNode({ id: p, kind: 'port', detail: 'inout' });

  // Each instance is a node.
  for (const inst of ast.instances) {
    pushNode({ id: inst.name, kind: 'cell', detail: inst.cell });
  }

  // Group endpoints by net.
  const nets: Record<string, string[]> = {};
  for (const inst of ast.instances) {
    for (const net of Object.values(inst.connections)) {
      const key = net.replace(/\s+/g, '');
      if (!key) continue;
      // If the net matches a top-level port name, attach the port node.
      if (seen.has(key) && !nets[key]?.includes(key)) {
        nets[key] = nets[key] ?? [];
        if (!nets[key].includes(key)) nets[key].push(key);
      }
      nets[key] = nets[key] ?? [];
      if (!nets[key].includes(inst.name)) nets[key].push(inst.name);
    }
  }

  // For each net with ≥2 endpoints, add edges in a star (first → others).
  // Star is enough for force-layout connectivity without a full clique.
  const edges: GraphEdge[] = [];
  for (const [net, endpoints] of Object.entries(nets)) {
    if (endpoints.length < 2) continue;
    const root = endpoints[0];
    for (let i = 1; i < endpoints.length; i++) {
      edges.push({ net, source: root, target: endpoints[i] });
    }
  }

  return { nodes, edges, nets };
}

/* -------------------------- Force-directed layout --------------------- */

export interface LayoutNode { id: string; x: number; y: number }
export interface LayoutOptions {
  width?: number;
  height?: number;
  iterations?: number;
  seed?: number;
}

/**
 * Tiny force-directed (Fruchterman-Reingold) layout. Returns absolute
 * (x, y) for each graph node, in the [0, width] × [0, height] box.
 *
 * For ≤500 nodes this terminates in a few hundred iterations comfortably.
 */
export function forceLayout(graph: NetlistGraph, opts: LayoutOptions = {}): LayoutNode[] {
  const W = opts.width ?? 800;
  const H = opts.height ?? 600;
  const iters = opts.iterations ?? 200;
  let seed = opts.seed ?? 1;
  const rand = () => {
    // LCG — same seed-pattern as the placer.
    seed = (seed * 1664525 + 1013904223) % 0x100000000;
    return seed / 0x100000000;
  };

  const k = Math.sqrt((W * H) / Math.max(1, graph.nodes.length));
  const positions = new Map<string, { x: number; y: number; dx: number; dy: number }>();
  for (const n of graph.nodes) {
    positions.set(n.id, { x: rand() * W, y: rand() * H, dx: 0, dy: 0 });
  }

  let temp = W / 10;
  const cool = temp / iters;

  for (let it = 0; it < iters; it++) {
    // Repulsive forces — O(n²); fine for graphs ≤ a few hundred nodes.
    for (const v of positions.values()) { v.dx = 0; v.dy = 0; }
    const ids = [...positions.keys()];
    for (let i = 0; i < ids.length; i++) {
      const pi = positions.get(ids[i])!;
      for (let j = i + 1; j < ids.length; j++) {
        const pj = positions.get(ids[j])!;
        const dx = pi.x - pj.x;
        const dy = pi.y - pj.y;
        const dist = Math.max(0.01, Math.sqrt(dx * dx + dy * dy));
        const f = (k * k) / dist;
        const ux = dx / dist, uy = dy / dist;
        pi.dx += ux * f; pi.dy += uy * f;
        pj.dx -= ux * f; pj.dy -= uy * f;
      }
    }
    // Attractive along edges.
    for (const e of graph.edges) {
      const a = positions.get(e.source);
      const b = positions.get(e.target);
      if (!a || !b) continue;
      const dx = a.x - b.x, dy = a.y - b.y;
      const dist = Math.max(0.01, Math.sqrt(dx * dx + dy * dy));
      const f = (dist * dist) / k;
      const ux = dx / dist, uy = dy / dist;
      a.dx -= ux * f; a.dy -= uy * f;
      b.dx += ux * f; b.dy += uy * f;
    }
    // Apply with temperature cap.
    for (const p of positions.values()) {
      const disp = Math.sqrt(p.dx * p.dx + p.dy * p.dy);
      const m = Math.min(disp, temp);
      if (disp > 0) {
        p.x += (p.dx / disp) * m;
        p.y += (p.dy / disp) * m;
      }
      p.x = Math.max(5, Math.min(W - 5, p.x));
      p.y = Math.max(5, Math.min(H - 5, p.y));
    }
    temp = Math.max(0.5, temp - cool);
  }

  return graph.nodes.map(n => {
    const p = positions.get(n.id)!;
    return { id: n.id, x: p.x, y: p.y };
  });
}
