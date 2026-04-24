/**
 * Structural Verilog netlist parser.
 *
 * Handles the subset that gate-level synthesis tools emit:
 *
 *   module top (a, b, y);
 *     input  a, b;
 *     output y;
 *     wire   n0, n1;
 *     AND2   u0 (.A(a), .B(b),  .Y(n0));
 *     INV    u1 (.A(n0), .Y(n1));
 *     BUF    u2 (.A(n1), .Y(y));
 *   endmodule
 *
 * Out of scope: behavioral RTL (always blocks, assign expressions),
 * generate blocks, parameters, multi-bit buses (we do support `[N:0]`
 * by expanding into N+1 single-bit signals), preprocessor directives,
 * task/function bodies. Both line and block comments and `timescale`/
 * `default_nettype` lines are stripped.
 */

import type { Cell, Net } from '@/types/algorithms';

export interface ParsedNetlist {
  moduleName: string;
  cells: Cell[];
  nets: Net[];
  /** Top-level ports — useful for wiring up benchmark drivers. */
  ports: { name: string; direction: 'input' | 'output' | 'inout' }[];
}

/* --------------------------------------------------------------------- */
/* Lexer-ish helpers                                                      */
/* --------------------------------------------------------------------- */

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')           // block comments
    .replace(/\/\/[^\n]*/g, '');                // line comments
}

/** Expand `wire [3:0] x;` into x_0, x_1, x_2, x_3. */
function expandRange(name: string, hi: number, lo: number): string[] {
  const out: string[] = [];
  if (hi >= lo) for (let i = lo; i <= hi; i++) out.push(`${name}_${i}`);
  else for (let i = hi; i <= lo; i++) out.push(`${name}_${i}`);
  return out;
}

/** Parse `[7:0]` returning {hi, lo}, or null. */
function parseRange(s: string): { hi: number; lo: number } | null {
  const m = s.match(/\[\s*(\d+)\s*:\s*(\d+)\s*\]/);
  return m ? { hi: parseInt(m[1], 10), lo: parseInt(m[2], 10) } : null;
}

/* --------------------------------------------------------------------- */
/* Public                                                                 */
/* --------------------------------------------------------------------- */

export function parseVerilog(src: string): ParsedNetlist {
  const cleaned = stripComments(src);
  const moduleMatch = cleaned.match(/module\s+(\w+)\s*\(([^)]*)\)\s*;([\s\S]*?)endmodule/);
  if (!moduleMatch) {
    throw new Error('No module … endmodule block found');
  }
  const moduleName = moduleMatch[1];
  const portList = moduleMatch[2].split(',').map(s => s.trim()).filter(Boolean);
  const body = moduleMatch[3];

  // Resolve port directions from declarations inside the body.
  const ports: { name: string; direction: 'input' | 'output' | 'inout' }[] = [];
  const portDir = new Map<string, 'input' | 'output' | 'inout'>();
  const dirRe = /\b(input|output|inout)\b\s*(\[[^\]]+\])?\s*([^;]+);/g;
  let m: RegExpExecArray | null;
  while ((m = dirRe.exec(body)) !== null) {
    const dir = m[1] as 'input' | 'output' | 'inout';
    const range = m[2] ? parseRange(m[2]) : null;
    const names = m[3].split(',').map(s => s.trim()).filter(Boolean);
    for (const n of names) {
      const expanded = range ? expandRange(n, range.hi, range.lo) : [n];
      for (const e of expanded) portDir.set(e, dir);
    }
  }
  for (const p of portList) {
    // Port list may use a base name; respect direction either from base or
    // first expanded element.
    const dir = portDir.get(p) ?? portDir.get(`${p}_0`) ?? 'inout';
    ports.push({ name: p, direction: dir });
  }

  // Wire declarations — collect the universe of net names we know about.
  const nets = new Map<string, Net>();
  const ensureNet = (name: string): Net => {
    let n = nets.get(name);
    if (!n) { n = { id: name, name, pins: [], weight: 1 }; nets.set(name, n); }
    return n;
  };
  // Seed nets with ports.
  for (const [name] of portDir) ensureNet(name);

  const wireRe = /\bwire\b\s*(\[[^\]]+\])?\s*([^;]+);/g;
  while ((m = wireRe.exec(body)) !== null) {
    const range = m[1] ? parseRange(m[1]) : null;
    const names = m[2].split(',').map(s => s.trim()).filter(Boolean);
    for (const n of names) {
      const expanded = range ? expandRange(n, range.hi, range.lo) : [n];
      for (const e of expanded) ensureNet(e);
    }
  }

  // Instances: `CELLTYPE INSTANCE_NAME (.PIN(net), .PIN(net), ...);`
  // Be tolerant of whitespace and ordered (positional) connections.
  const instRe =
    /\b([A-Za-z_]\w*)\s+([A-Za-z_]\w*)\s*\(([\s\S]*?)\)\s*;/g;
  const cells: Cell[] = [];
  while ((m = instRe.exec(body)) !== null) {
    const cellType = m[1];
    const instName = m[2];
    const conns = m[3];
    // Skip Verilog keywords masquerading as cell types (paranoia).
    if (['module', 'input', 'output', 'inout', 'wire', 'reg', 'assign',
         'always', 'initial', 'parameter', 'localparam'].includes(cellType)) {
      continue;
    }

    const pins: Cell['pins'] = [];
    // Match either `.pin(net)` (named) or `net` (positional).
    const namedRe = /\.\s*(\w+)\s*\(\s*([\w\[\]:]+)\s*\)/g;
    let pm: RegExpExecArray | null;
    let foundNamed = false;
    while ((pm = namedRe.exec(conns)) !== null) {
      foundNamed = true;
      const pinName = pm[1];
      const netRef = pm[2].replace(/\[(\d+)\]/, '_$1'); // x[0] → x_0
      const pinId = `${instName}/${pinName}`;
      // Heuristic: outputs are named Y, Q, OUT, Z; everything else input.
      const dir: 'input' | 'output' =
        /^(Y|Z|Q|OUT|O\d*)$/i.test(pinName) ? 'output' : 'input';
      pins.push({
        id: pinId, name: pinName,
        position: { x: dir === 'input' ? 0 : 20, y: 10 },
        direction: dir,
      });
      ensureNet(netRef).pins.push(pinId);
    }
    if (!foundNamed) {
      // Positional connections — best-effort; assume single output as last.
      const tokens = conns.split(',').map(s => s.trim()).filter(Boolean);
      tokens.forEach((tok, i) => {
        const isLast = i === tokens.length - 1;
        const pinName = isLast ? 'Y' : `A${i}`;
        const dir = isLast ? 'output' : 'input';
        const pinId = `${instName}/${pinName}`;
        pins.push({
          id: pinId, name: pinName,
          position: { x: dir === 'input' ? 0 : 20, y: 10 },
          direction: dir as 'input' | 'output',
        });
        ensureNet(tok).pins.push(pinId);
      });
    }

    cells.push({
      id: instName,
      name: cellType,
      width: 20,
      height: 20,
      pins,
      type: 'standard',
    });
  }

  return {
    moduleName,
    cells,
    nets: Array.from(nets.values()).filter(n => n.pins.length > 0),
    ports,
  };
}
