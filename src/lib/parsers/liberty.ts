/**
 * Liberty (.lib) cell-library parser — small but useful subset.
 *
 * Liberty is a brace-grouped, attribute = value language. Real .lib files
 * are huge and embed full nonlinear-delay tables (NLDM); we model just the
 * structural skeleton most browsers need: per-cell area / leakage_power,
 * per-pin direction / capacitance, and the *count* of timing arcs. The
 * NLDM table data is read but not interpreted further.
 *
 * Grammar (simplified):
 *
 *     library (NAME) {
 *       attribute : value ;
 *       cell (NAME) {
 *         area : 1.234 ;
 *         cell_leakage_power : 5.6e-9 ;
 *         pin (NAME) {
 *           direction : input ;
 *           capacitance : 0.002 ;
 *           timing () { related_pin : "X" ; ... }
 *         }
 *       }
 *     }
 *
 * Strings may be bare or double-quoted. Comments are `/​* ... *​/`. We
 * ignore unknown attributes but remember warnings so the UI can flag them.
 */

export type PinDirection = 'input' | 'output' | 'inout' | 'internal' | 'unknown';

export interface LibertyPin {
  name: string;
  direction: PinDirection;
  capacitance: number | null;
  /** Number of `timing () { ... }` blocks attached to this pin. */
  timingArcs: number;
  /** `function : "..."` if present (Boolean expression). */
  func: string | null;
}

export interface LibertyCell {
  name: string;
  area: number | null;
  leakage: number | null;
  /** Sum of every pin's timing arc count. */
  totalArcs: number;
  pins: LibertyPin[];
}

export interface LibertyLibrary {
  name: string;
  cells: LibertyCell[];
  /** Top-level attributes that could be parsed (technology, units, etc.). */
  attributes: Record<string, string>;
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

type Tok = { v: string; line: number };

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  let line = 1;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === '\n') { line++; i++; continue; }
    if (/\s/.test(c)) { i++; continue; }
    // Comments: /* ... */  and //
    if (c === '/' && src[i + 1] === '*') {
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) {
        if (src[i] === '\n') line++;
        i++;
      }
      i += 2;
      continue;
    }
    if (c === '/' && src[i + 1] === '/') {
      while (i < n && src[i] !== '\n') i++;
      continue;
    }
    // Quoted strings.
    if (c === '"') {
      let j = i + 1;
      while (j < n && src[j] !== '"') {
        if (src[j] === '\\') j += 2;
        else { if (src[j] === '\n') line++; j++; }
      }
      out.push({ v: src.slice(i + 1, j), line });
      i = j + 1;
      continue;
    }
    // Single-char tokens.
    if ('(){}:;,'.includes(c)) {
      out.push({ v: c, line });
      i++;
      continue;
    }
    // Bare identifier / number.
    let j = i;
    while (j < n && !/[\s(){}:;,"]/.test(src[j])) j++;
    if (j > i) {
      out.push({ v: src.slice(i, j), line });
      i = j;
      continue;
    }
    i++; // skip unknown
  }
  return out;
}

// ---------------------------------------------------------------------------
// Parser — block grammar
// ---------------------------------------------------------------------------

function pinDirection(s: string): PinDirection {
  switch (s.toLowerCase()) {
    case 'input':
    case 'output':
    case 'inout':
    case 'internal': return s.toLowerCase() as PinDirection;
    default: return 'unknown';
  }
}

function toNumber(s: string): number | null {
  if (s == null) return null;
  const cleaned = s.replace(/^"+|"+$/g, '');
  const v = Number(cleaned);
  return Number.isFinite(v) ? v : null;
}

export function parseLiberty(src: string): LibertyLibrary {
  const toks = tokenize(src);
  const warnings: string[] = [];
  const lib: LibertyLibrary = {
    name: '',
    cells: [],
    attributes: {},
    warnings,
  };
  let p = 0;

  function peek(off = 0): Tok | undefined { return toks[p + off]; }
  function eat(v: string): boolean {
    if (toks[p]?.v === v) { p++; return true; }
    return false;
  }
  function expect(v: string): void {
    if (!eat(v)) {
      warnings.push(`expected '${v}' at line ${toks[p]?.line ?? '?'}, got '${toks[p]?.v ?? '<eof>'}'`);
    }
  }

  function readGroupHeader(): { name: string; arg: string } | null {
    const head = peek();
    if (!head) return null;
    const name = head.v;
    p++;
    if (peek()?.v !== '(') return { name, arg: '' };
    p++;
    let arg = '';
    while (p < toks.length && peek()!.v !== ')') {
      if (arg) arg += ' ';
      arg += peek()!.v;
      p++;
    }
    expect(')');
    return { name, arg: arg.replace(/^"+|"+$/g, '') };
  }

  /** Skip a block from `{` to its matching `}`. Assumes `{` already consumed. */
  function skipBlock(): void {
    let depth = 1;
    while (p < toks.length && depth > 0) {
      const t = toks[p++].v;
      if (t === '{') depth++;
      else if (t === '}') depth--;
    }
  }

  function parsePin(name: string): LibertyPin {
    const pin: LibertyPin = {
      name, direction: 'unknown',
      capacitance: null, timingArcs: 0, func: null,
    };
    while (p < toks.length && peek()!.v !== '}') {
      const t = toks[p];
      // attribute : value ;
      // group ( ... ) { ... }
      if (peek(1)?.v === ':') {
        const key = t.v;
        p += 2;
        const val: string[] = [];
        while (p < toks.length && peek()!.v !== ';') { val.push(peek()!.v); p++; }
        eat(';');
        const sval = val.join(' ');
        if (key === 'direction') pin.direction = pinDirection(sval);
        else if (key === 'capacitance') pin.capacitance = toNumber(sval);
        else if (key === 'function') pin.func = sval.replace(/^"+|"+$/g, '');
        continue;
      }
      // group
      const head = readGroupHeader();
      if (!head) break;
      if (peek()?.v === '{') {
        p++;
        if (head.name === 'timing') pin.timingArcs++;
        skipBlock();
      } else {
        eat(';');
      }
    }
    eat('}');
    return pin;
  }

  function parseCell(name: string): LibertyCell {
    const cell: LibertyCell = {
      name, area: null, leakage: null, totalArcs: 0, pins: [],
    };
    while (p < toks.length && peek()!.v !== '}') {
      if (peek(1)?.v === ':') {
        const key = peek()!.v;
        p += 2;
        const val: string[] = [];
        while (p < toks.length && peek()!.v !== ';') { val.push(peek()!.v); p++; }
        eat(';');
        const sval = val.join(' ');
        if (key === 'area') cell.area = toNumber(sval);
        else if (key === 'cell_leakage_power') cell.leakage = toNumber(sval);
        continue;
      }
      const head = readGroupHeader();
      if (!head) break;
      if (peek()?.v === '{') {
        p++;
        if (head.name === 'pin') cell.pins.push(parsePin(head.arg));
        else skipBlock();
      } else {
        eat(';');
      }
    }
    eat('}');
    cell.totalArcs = cell.pins.reduce((a, p) => a + p.timingArcs, 0);
    return cell;
  }

  // Library shell.
  while (p < toks.length) {
    const head = readGroupHeader();
    if (!head) break;
    if (peek()?.v === '{') {
      p++;
      if (head.name === 'library') {
        lib.name = head.arg;
        // descend into library body
        while (p < toks.length && peek()!.v !== '}') {
          if (peek(1)?.v === ':') {
            const key = peek()!.v;
            p += 2;
            const val: string[] = [];
            while (p < toks.length && peek()!.v !== ';') { val.push(peek()!.v); p++; }
            eat(';');
            lib.attributes[key] = val.join(' ').replace(/^"+|"+$/g, '');
            continue;
          }
          const sub = readGroupHeader();
          if (!sub) break;
          if (peek()?.v === '{') {
            p++;
            if (sub.name === 'cell') lib.cells.push(parseCell(sub.arg));
            else skipBlock();
          } else {
            eat(';');
          }
        }
        eat('}');
      } else {
        skipBlock();
      }
    } else {
      eat(';');
    }
  }

  if (lib.cells.length === 0) warnings.push('No cells parsed.');
  return lib;
}

export interface LibertySummary {
  cellCount: number;
  pinCount: number;
  arcCount: number;
  /** Mean / min / max area (null if no area attributes seen). */
  area: { min: number; max: number; mean: number } | null;
  leakage: { min: number; max: number; mean: number } | null;
  /** Distribution of pin directions across all cells. */
  directions: Record<PinDirection, number>;
}

export function summariseLiberty(lib: LibertyLibrary): LibertySummary {
  let pins = 0, arcs = 0;
  const areas: number[] = [];
  const leaks: number[] = [];
  const dirs: Record<PinDirection, number> = {
    input: 0, output: 0, inout: 0, internal: 0, unknown: 0,
  };
  for (const c of lib.cells) {
    if (c.area != null)    areas.push(c.area);
    if (c.leakage != null) leaks.push(c.leakage);
    arcs += c.totalArcs;
    for (const p of c.pins) {
      pins++;
      dirs[p.direction]++;
    }
  }
  function stat(xs: number[]) {
    if (xs.length === 0) return null;
    let sum = 0, min = Infinity, max = -Infinity;
    for (const v of xs) { sum += v; if (v < min) min = v; if (v > max) max = v; }
    return { min, max, mean: sum / xs.length };
  }
  return {
    cellCount: lib.cells.length,
    pinCount: pins,
    arcCount: arcs,
    area: stat(areas),
    leakage: stat(leaks),
    directions: dirs,
  };
}
