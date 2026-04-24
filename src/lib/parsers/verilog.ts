/**
 * Verilog / SystemVerilog structural netlist parser.
 *
 * Scope: gate-level + structural RTL — modules, port lists, wire/reg/logic
 * declarations, primitive gate instantiations, user-module instantiations
 * (positional and named port connections), and continuous `assign` statements.
 *
 * Not supported (out of scope for a structural parser): behavioural blocks
 * (always / initial), generate loops, tasks/functions, SystemVerilog
 * interfaces, packed/unpacked structs, parameter expressions beyond integers.
 * Those are quietly skipped so that a netlist containing them still parses.
 *
 * The parser is tokenizer-driven (not regex) so names like `wire_count` are
 * not mistaken for the `wire` keyword, and comments / strings do not confuse
 * the bracket matcher.
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type PortDirection = 'input' | 'output' | 'inout';

export interface PortDecl {
  name: string;
  direction: PortDirection;
  /** MSB of a packed range, or null for scalar. */
  msb: number | null;
  /** LSB of a packed range, or null for scalar. */
  lsb: number | null;
}

export interface WireDecl {
  name: string;
  /** 'wire' | 'reg' | 'logic' | 'tri' | 'wand' | 'wor' — kept for round-trip. */
  kind: string;
  msb: number | null;
  lsb: number | null;
}

export interface PortConnection {
  /** Port name (null for positional connections). */
  port: string | null;
  /** Net / signal expression on the other side. `null` means left unconnected, e.g. `.q()`. */
  net: string | null;
}

export interface Instance {
  /** Instance name e.g. `u1`. */
  name: string;
  /** Cell or module type e.g. `and`, `NAND2_X1`, `adder`. */
  type: string;
  /** True if `type` is one of the built-in gate primitives (and/or/nand/...). */
  isPrimitive: boolean;
  /** Named port connections. If empty and `positional` is non-empty, the
   *  instance uses positional connections. */
  connections: PortConnection[];
  positional: string[];
}

export interface Assign {
  lhs: string;
  rhs: string;
}

export interface Module {
  name: string;
  ports: PortDecl[];
  wires: WireDecl[];
  instances: Instance[];
  assigns: Assign[];
}

export interface Netlist {
  modules: Module[];
  /** Non-fatal issues observed while parsing. */
  warnings: string[];
}

export interface ParseError {
  message: string;
  line: number;
  column: number;
}

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

type TokKind =
  | 'id'       // identifier or keyword
  | 'num'      // integer / sized literal
  | 'string'   // double-quoted literal
  | 'punct'    // single-char punctuation we care about
  | 'eof';

interface Token {
  kind: TokKind;
  value: string;
  line: number;
  col: number;
}

/** Verilog keywords we react to. Everything else is treated as an identifier. */
const KEYWORDS = new Set([
  'module', 'endmodule', 'input', 'output', 'inout',
  'wire', 'reg', 'logic', 'tri', 'wand', 'wor',
  'assign', 'parameter', 'localparam',
  'begin', 'end', 'always', 'always_ff', 'always_comb', 'always_latch',
  'initial', 'generate', 'endgenerate', 'function', 'endfunction',
  'task', 'endtask', 'genvar',
  'supply0', 'supply1',
]);

const GATE_PRIMITIVES = new Set([
  'and', 'or', 'nand', 'nor', 'xor', 'xnor',
  'not', 'buf', 'bufif0', 'bufif1', 'notif0', 'notif1',
  'nmos', 'pmos', 'cmos', 'rnmos', 'rpmos', 'rcmos',
  'tran', 'tranif0', 'tranif1', 'rtran', 'rtranif0', 'rtranif1',
  'pullup', 'pulldown',
]);

function isIdStart(c: string): boolean {
  return /[A-Za-z_\\]/.test(c);
}
function isIdCont(c: string): boolean {
  return /[A-Za-z0-9_$]/.test(c);
}
function isDigit(c: string): boolean {
  return c >= '0' && c <= '9';
}

function tokenize(src: string): Token[] {
  const toks: Token[] = [];
  let i = 0;
  let line = 1;
  let col = 1;
  const n = src.length;

  const push = (kind: TokKind, value: string, l: number, c: number) =>
    toks.push({ kind, value, line: l, col: c });

  while (i < n) {
    const c = src[i];

    // Newline.
    if (c === '\n') { i++; line++; col = 1; continue; }
    // Whitespace.
    if (c === ' ' || c === '\t' || c === '\r') { i++; col++; continue; }

    // Line comment.
    if (c === '/' && src[i + 1] === '/') {
      while (i < n && src[i] !== '\n') i++;
      continue;
    }
    // Block comment.
    if (c === '/' && src[i + 1] === '*') {
      i += 2; col += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) {
        if (src[i] === '\n') { line++; col = 1; } else col++;
        i++;
      }
      if (i < n) { i += 2; col += 2; }
      continue;
    }

    // Compiler directives `` ident — skip the whole line. This covers
    // `define, `include, `timescale, `ifdef etc. We don't expand macros.
    if (c === '`') {
      while (i < n && src[i] !== '\n') i++;
      continue;
    }

    // String literal.
    if (c === '"') {
      const startL = line, startC = col;
      i++; col++;
      let s = '';
      while (i < n && src[i] !== '"') {
        if (src[i] === '\\' && i + 1 < n) { s += src[i] + src[i + 1]; i += 2; col += 2; continue; }
        if (src[i] === '\n') { line++; col = 1; } else col++;
        s += src[i]; i++;
      }
      if (i < n) { i++; col++; } // closing "
      push('string', s, startL, startC);
      continue;
    }

    // Escaped identifier: \name followed by whitespace.
    if (c === '\\') {
      const startL = line, startC = col;
      i++; col++;
      let s = '';
      while (i < n && !/\s/.test(src[i])) { s += src[i]; i++; col++; }
      push('id', s, startL, startC);
      continue;
    }

    // Identifier or keyword.
    if (isIdStart(c)) {
      const startL = line, startC = col;
      let s = '';
      while (i < n && isIdCont(src[i])) { s += src[i]; i++; col++; }
      push('id', s, startL, startC);
      continue;
    }

    // Number: 4'b1010, 32'hDEAD_BEEF, 12, 3'd5, etc.
    if (isDigit(c)) {
      const startL = line, startC = col;
      let s = '';
      while (i < n && (isDigit(src[i]) || src[i] === '_')) { s += src[i]; i++; col++; }
      // Sized form: <size> ' <base> <value>
      if (i < n && src[i] === "'") {
        s += src[i]; i++; col++;
        if (i < n && /[sS]/.test(src[i])) { s += src[i]; i++; col++; }
        if (i < n && /[bBoOdDhH]/.test(src[i])) { s += src[i]; i++; col++; }
        while (i < n && /[0-9a-fA-FxXzZ_?]/.test(src[i])) {
          s += src[i]; i++; col++;
        }
      }
      push('num', s, startL, startC);
      continue;
    }

    // Unsized literal starting with '.
    if (c === "'") {
      const startL = line, startC = col;
      let s = c; i++; col++;
      if (i < n && /[sS]/.test(src[i])) { s += src[i]; i++; col++; }
      if (i < n && /[bBoOdDhH01xXzZ]/.test(src[i])) {
        while (i < n && /[0-9a-fA-FxXzZ_?bBoOdDhH]/.test(src[i])) {
          s += src[i]; i++; col++;
        }
        push('num', s, startL, startC);
        continue;
      }
      // else fall through to punct
      push('punct', "'", startL, startC);
      continue;
    }

    // Multi-char punct we treat as single chars for parsing simplicity,
    // because we only need a coarse structural parse.
    push('punct', c, line, col);
    i++; col++;
  }

  push('eof', '', line, col);
  return toks;
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

class Parser {
  private toks: Token[];
  private pos = 0;
  private warnings: string[] = [];

  constructor(toks: Token[]) { this.toks = toks; }

  private peek(offset = 0): Token { return this.toks[this.pos + offset]; }
  private eat(): Token { return this.toks[this.pos++]; }

  private isKeyword(t: Token, kw: string): boolean {
    return t.kind === 'id' && t.value === kw;
  }
  private match(kind: TokKind, value?: string): boolean {
    const t = this.peek();
    return t.kind === kind && (value === undefined || t.value === value);
  }
  private expect(kind: TokKind, value?: string): Token {
    const t = this.peek();
    if (t.kind !== kind || (value !== undefined && t.value !== value)) {
      throw this.err(`expected ${value ?? kind} but got '${t.value}'`, t);
    }
    return this.eat();
  }
  private err(msg: string, at?: Token): Error {
    const t = at ?? this.peek();
    const e = new Error(`${msg} at line ${t.line}:${t.col}`) as Error & ParseError;
    (e as any).line = t.line;
    (e as any).column = t.col;
    return e;
  }

  parse(): Netlist {
    const modules: Module[] = [];
    while (!this.match('eof')) {
      if (this.isKeyword(this.peek(), 'module')) {
        modules.push(this.parseModule());
      } else {
        // Top-level directive we don't understand — skip one token.
        this.eat();
      }
    }
    return { modules, warnings: this.warnings };
  }

  private parseModule(): Module {
    this.expect('id', 'module');
    const nameTok = this.expect('id');
    const mod: Module = {
      name: nameTok.value,
      ports: [], wires: [], instances: [], assigns: [],
    };

    // Optional parameter list: `#(...)`
    if (this.match('punct', '#')) {
      this.eat();
      this.skipBalanced('(', ')');
    }

    // Port list: ( a, b, c ) — may be ANSI-style with directions inline.
    const ansiPorts: PortDecl[] = [];
    const portNames: string[] = [];
    if (this.match('punct', '(')) {
      this.eat();
      while (!this.match('punct', ')') && !this.match('eof')) {
        const parsed = this.tryParseAnsiPort();
        if (parsed) {
          ansiPorts.push(...parsed);
        } else {
          // Non-ANSI: just a port name, direction declared later.
          const nm = this.expect('id').value;
          portNames.push(nm);
        }
        if (this.match('punct', ',')) this.eat();
      }
      this.expect('punct', ')');
    }
    this.expect('punct', ';');

    mod.ports.push(...ansiPorts);

    // Module body.
    while (!this.isKeyword(this.peek(), 'endmodule') && !this.match('eof')) {
      if (!this.parseModuleItem(mod)) {
        // Unknown construct — skip to next semicolon to stay resilient.
        this.skipToSemicolon();
      }
    }
    if (!this.match('eof')) this.eat(); // endmodule

    // Back-fill directions for non-ANSI ports the user declared via
    // `input a; output b;` inside the module body.
    if (portNames.length > 0 && mod.ports.length < portNames.length) {
      const byName = new Map(mod.ports.map(p => [p.name, p]));
      mod.ports = portNames.map(n => byName.get(n) ?? {
        name: n, direction: 'inout', msb: null, lsb: null,
      });
    }
    return mod;
  }

  /** Parse an ANSI-style port entry like `input wire [7:0] a, b`. Returns
   *  null if this entry is just a bare identifier (non-ANSI). */
  private tryParseAnsiPort(): PortDecl[] | null {
    const t = this.peek();
    if (t.kind !== 'id') return null;
    if (t.value !== 'input' && t.value !== 'output' && t.value !== 'inout') {
      return null;
    }
    const direction = this.eat().value as PortDirection;
    // Optional net kind (`wire`, `reg`, `logic`).
    if (this.peek().kind === 'id' &&
        ['wire', 'reg', 'logic', 'tri', 'wand', 'wor'].includes(this.peek().value)) {
      this.eat();
    }
    const { msb, lsb } = this.parseOptionalRange();
    const names: string[] = [this.expect('id').value];
    while (this.match('punct', ',')) {
      // Lookahead: if the next token after `,` is another direction keyword,
      // this is a new ANSI port entry, not another name for this one.
      const save = this.pos;
      this.eat();
      const n = this.peek();
      if (n.kind === 'id' && (n.value === 'input' || n.value === 'output' || n.value === 'inout')) {
        this.pos = save;
        break;
      }
      if (n.kind !== 'id') { this.pos = save; break; }
      names.push(this.eat().value);
    }
    return names.map(n => ({ name: n, direction, msb, lsb }));
  }

  private parseOptionalRange(): { msb: number | null; lsb: number | null } {
    if (!this.match('punct', '[')) return { msb: null, lsb: null };
    this.eat();
    const msb = this.readIntExpr();
    this.expect('punct', ':');
    const lsb = this.readIntExpr();
    this.expect('punct', ']');
    return { msb, lsb };
  }

  /** Very small integer-expression reader: handles a single number, an
   *  identifier (treated as unknown -> null), or a parenthesised group
   *  consumed and treated as unknown. */
  private readIntExpr(): number | null {
    const t = this.peek();
    if (t.kind === 'num') {
      this.eat();
      return parseVerilogInt(t.value);
    }
    if (t.kind === 'id') {
      this.eat();
      return null; // parameter or symbol — not evaluated
    }
    if (this.match('punct', '(')) {
      this.skipBalanced('(', ')');
      return null;
    }
    return null;
  }

  /** Parse one top-level module item. Returns false if not recognised so the
   *  caller can skip-to-semicolon. */
  private parseModuleItem(mod: Module): boolean {
    const t = this.peek();
    if (t.kind !== 'id') return false;

    // Port-direction declaration in the body (non-ANSI style).
    if (t.value === 'input' || t.value === 'output' || t.value === 'inout') {
      const direction = this.eat().value as PortDirection;
      if (this.peek().kind === 'id' &&
          ['wire', 'reg', 'logic', 'tri', 'wand', 'wor'].includes(this.peek().value)) {
        this.eat();
      }
      const { msb, lsb } = this.parseOptionalRange();
      const names = this.readIdList();
      this.expect('punct', ';');
      for (const n of names) {
        mod.ports.push({ name: n, direction, msb, lsb });
      }
      return true;
    }

    // Net declarations.
    if (['wire', 'reg', 'logic', 'tri', 'wand', 'wor'].includes(t.value)) {
      const kind = this.eat().value;
      const { msb, lsb } = this.parseOptionalRange();
      const names = this.readIdList();
      this.expect('punct', ';');
      for (const n of names) mod.wires.push({ name: n, kind, msb, lsb });
      return true;
    }

    // Continuous assign.
    if (t.value === 'assign') {
      this.eat();
      const lhs = this.readExprUntil([',', ';'], '=');
      this.expect('punct', '=');
      const rhs = this.readExprUntil([';']);
      this.expect('punct', ';');
      mod.assigns.push({ lhs: lhs.trim(), rhs: rhs.trim() });
      return true;
    }

    // Behavioural / unsupported blocks — skip to matching `end`/`endgenerate`.
    if (['always', 'always_ff', 'always_comb', 'always_latch',
         'initial', 'function', 'task', 'generate'].includes(t.value)) {
      this.warnings.push(`skipped ${t.value} block at line ${t.line}`);
      this.skipBehavioural(t.value);
      return true;
    }

    // Parameter declarations.
    if (t.value === 'parameter' || t.value === 'localparam') {
      this.skipToSemicolon();
      return true;
    }

    // supply0/supply1 nets.
    if (t.value === 'supply0' || t.value === 'supply1') {
      this.eat();
      const names = this.readIdList();
      this.expect('punct', ';');
      for (const n of names) mod.wires.push({ name: n, kind: t.value, msb: null, lsb: null });
      return true;
    }

    // Otherwise this is either a gate primitive or a user-module instantiation.
    return this.parseInstantiation(mod);
  }

  private parseInstantiation(mod: Module): boolean {
    const typeTok = this.peek();
    if (typeTok.kind !== 'id') return false;
    const cellType = typeTok.value;
    this.eat();

    // Optional strength / drive: ( supply0, supply1 ) — we skip.
    if (this.match('punct', '(')) {
      // Heuristic: if the token before '(' was a keyword like `strong0` etc
      // we'd consume — but we don't track strengths. If this is actually the
      // instance port list because instance name was omitted (allowed for
      // primitives), we handle that in the instance loop below.
    }
    // Optional parameter override: #(...)
    if (this.match('punct', '#')) {
      this.eat();
      this.skipBalanced('(', ')');
    }

    const isPrimitive = GATE_PRIMITIVES.has(cellType);

    // One or more instance names, each with a port list.
    do {
      let instName = '';
      // Primitives may be unnamed: `and (out, a, b);`
      if (isPrimitive && this.match('punct', '(')) {
        instName = `__anon_${mod.instances.length}`;
      } else {
        if (!this.match('id')) {
          // Unexpected — bail out and let caller skip.
          return false;
        }
        instName = this.eat().value;
        // Optional array range on instance: `foo u[3:0] (...)`.
        this.parseOptionalRange();
      }

      this.expect('punct', '(');
      const { connections, positional } = this.parsePortConnections();
      this.expect('punct', ')');
      mod.instances.push({
        name: instName, type: cellType, isPrimitive,
        connections, positional,
      });
    } while (this.match('punct', ',') && (this.eat(), true));

    this.expect('punct', ';');
    return true;
  }

  private parsePortConnections(): { connections: PortConnection[]; positional: string[] } {
    const connections: PortConnection[] = [];
    const positional: string[] = [];

    if (this.match('punct', ')')) return { connections, positional };

    // Determine style: if next token is `.`, use named style; otherwise positional.
    if (this.match('punct', '.')) {
      while (!this.match('punct', ')') && !this.match('eof')) {
        this.expect('punct', '.');
        const port = this.expect('id').value;
        this.expect('punct', '(');
        let net: string | null = null;
        if (!this.match('punct', ')')) {
          net = this.readExprUntil([')']).trim();
          if (net === '') net = null;
        }
        this.expect('punct', ')');
        connections.push({ port, net });
        if (this.match('punct', ',')) this.eat();
      }
    } else {
      while (!this.match('punct', ')') && !this.match('eof')) {
        const expr = this.readExprUntil([',', ')']).trim();
        if (expr !== '') positional.push(expr);
        if (this.match('punct', ',')) this.eat();
      }
    }
    return { connections, positional };
  }

  // ---- helpers ----------------------------------------------------------

  private readIdList(): string[] {
    const names: string[] = [];
    names.push(this.expect('id').value);
    // Ignore optional initialisation `= expr`.
    if (this.match('punct', '=')) this.readExprUntil([',', ';']);
    while (this.match('punct', ',')) {
      this.eat();
      names.push(this.expect('id').value);
      if (this.match('punct', '=')) this.readExprUntil([',', ';']);
    }
    return names;
  }

  /** Read raw expression text up to (but not consuming) one of the given
   *  punctuation chars at the same bracket-depth. */
  private readExprUntil(stop: string[], alsoStop?: string): string {
    let buf = '';
    let paren = 0, brack = 0, brace = 0;
    while (!this.match('eof')) {
      const t = this.peek();
      if (t.kind === 'punct') {
        if (paren === 0 && brack === 0 && brace === 0) {
          if (stop.includes(t.value)) break;
          if (alsoStop !== undefined && t.value === alsoStop) break;
        }
        if (t.value === '(') paren++;
        else if (t.value === ')') { if (paren === 0) break; paren--; }
        else if (t.value === '[') brack++;
        else if (t.value === ']') brack--;
        else if (t.value === '{') brace++;
        else if (t.value === '}') brace--;
      }
      buf += (buf && t.kind !== 'punct' ? ' ' : '') + t.value;
      this.eat();
    }
    return buf;
  }

  private skipBalanced(open: string, close: string): void {
    // Assumes we're at the `open` token; consume it first if so.
    if (this.match('punct', open)) this.eat();
    let depth = 1;
    while (depth > 0 && !this.match('eof')) {
      const t = this.eat();
      if (t.kind === 'punct' && t.value === open) depth++;
      else if (t.kind === 'punct' && t.value === close) depth--;
    }
  }

  private skipToSemicolon(): void {
    while (!this.match('eof') && !this.match('punct', ';')) this.eat();
    if (this.match('punct', ';')) this.eat();
  }

  /** Skip a behavioural block by tracking `begin`/`end` pairs, or
   *  `generate`/`endgenerate`, etc. */
  private skipBehavioural(starter: string): void {
    this.eat(); // starter keyword
    const endKw =
      starter === 'generate' ? 'endgenerate' :
      starter === 'function' ? 'endfunction' :
      starter === 'task'     ? 'endtask' :
      null;

    // For always/initial, the "block" is a single statement or a begin/end.
    if (endKw === null) {
      // Skip optional event control `@ ( ... )` or `@(posedge clk)`.
      if (this.match('punct', '@')) {
        this.eat();
        if (this.match('punct', '(')) this.skipBalanced('(', ')');
        else if (this.match('id')) this.eat();
      }
      if (this.isKeyword(this.peek(), 'begin')) {
        this.eat();
        let depth = 1;
        while (depth > 0 && !this.match('eof')) {
          const t = this.eat();
          if (this.isKeyword(t, 'begin')) depth++;
          else if (this.isKeyword(t, 'end')) depth--;
        }
      } else {
        this.skipToSemicolon();
      }
      return;
    }

    // generate/function/task: skip tokens until matching endXxx.
    while (!this.match('eof') && !this.isKeyword(this.peek(), endKw)) this.eat();
    if (!this.match('eof')) this.eat();
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert a Verilog integer literal to a JS number.
 *  Handles: `42`, `32'hDEAD_BEEF`, `4'b1010`, `3'd5`, `'b11`.
 *  Returns null for x/z literals (unknown / high-Z). */
export function parseVerilogInt(lit: string): number | null {
  const cleaned = lit.replace(/_/g, '');
  if (!cleaned.includes("'")) {
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  // Sized or unsized based literal.
  const m = cleaned.match(/^(\d*)'([sS]?)([bBoOdDhH])([0-9a-fA-FxXzZ?]+)$/);
  if (!m) return null;
  const base = m[3].toLowerCase();
  const digits = m[4].toLowerCase();
  if (/[xz?]/.test(digits)) return null;
  const radix = base === 'b' ? 2 : base === 'o' ? 8 : base === 'd' ? 10 : 16;
  const v = parseInt(digits, radix);
  return Number.isFinite(v) ? v : null;
}

/** Convenience: flatten a parsed netlist into a set of net names (vectors
 *  expanded to `name[i]` entries). */
export function expandNets(mod: Module): Set<string> {
  const out = new Set<string>();
  const add = (name: string, msb: number | null, lsb: number | null) => {
    if (msb === null || lsb === null) { out.add(name); return; }
    const hi = Math.max(msb, lsb);
    const lo = Math.min(msb, lsb);
    for (let i = lo; i <= hi; i++) out.add(`${name}[${i}]`);
  };
  for (const p of mod.ports) add(p.name, p.msb, p.lsb);
  for (const w of mod.wires) add(w.name, w.msb, w.lsb);
  return out;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function parseVerilog(source: string): Netlist {
  const toks = tokenize(source);
  return new Parser(toks).parse();
}

/** Safe wrapper that catches parse errors and returns them alongside a
 *  (possibly partial) netlist.  Useful for the LVS flow where we want to
 *  surface parse issues as violations instead of throwing. */
export function tryParseVerilog(source: string): { netlist: Netlist; errors: ParseError[] } {
  const errors: ParseError[] = [];
  try {
    return { netlist: parseVerilog(source), errors };
  } catch (e) {
    const err = e as Error & { line?: number; column?: number };
    errors.push({
      message: err.message,
      line: err.line ?? 0,
      column: err.column ?? 0,
    });
    return { netlist: { modules: [], warnings: [] }, errors };
  }
}
