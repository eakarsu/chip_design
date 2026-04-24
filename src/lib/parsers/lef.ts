/**
 * LEF (Library Exchange Format) parser.
 *
 * Supports the subset the rest of the toolchain actually uses:
 *   - UNITS         (DATABASE MICRONS)
 *   - MANUFACTURINGGRID
 *   - SITE          (with SIZE and SYMMETRY)
 *   - LAYER         (ROUTING / CUT / MASTERSLICE subset)
 *   - VIA
 *   - MACRO
 *       CLASS, ORIGIN, SIZE, SYMMETRY, SITE, FOREIGN
 *       PIN { DIRECTION, USE, PORT { LAYER / RECT ... } }
 *       OBS { LAYER / RECT ... }
 *
 * Not supported (ignored with a warning):
 *   - PROPERTYDEFINITIONS, NONDEFAULTRULE, antenna properties, timing tables.
 *
 * LEF syntax is line/statement oriented with ';' terminators. Blocks are
 * opened with a keyword like "MACRO foo" and closed with "END foo". The
 * parser is a small tokenizer + recursive-descent that recognises those
 * START/END bookends.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

export interface Rect { xl: number; yl: number; xh: number; yh: number; }

export interface LefSite {
  name: string;
  /** Class: CORE / PAD / etc. Free-form in LEF 5.8+. */
  class?: string;
  width: number;
  height: number;
  symmetry?: string[];
}

export type LefLayerType = 'ROUTING' | 'CUT' | 'MASTERSLICE' | 'OVERLAP' | 'IMPLANT' | 'OTHER';

export interface LefLayer {
  name: string;
  type: LefLayerType;
  direction?: 'HORIZONTAL' | 'VERTICAL';
  pitch?: number;
  width?: number;
  spacing?: number;
  offset?: number;
}

export interface LefPort {
  layer?: string;
  rects: Rect[];
}

export interface LefPin {
  name: string;
  direction?: 'INPUT' | 'OUTPUT' | 'INOUT' | 'FEEDTHRU';
  use?: 'SIGNAL' | 'POWER' | 'GROUND' | 'CLOCK' | 'ANALOG';
  ports: LefPort[];
}

export interface LefObstruction {
  layer: string;
  rects: Rect[];
}

export interface LefMacro {
  name: string;
  class?: string;
  foreign?: { name: string; x: number; y: number };
  origin: { x: number; y: number };
  size: { width: number; height: number };
  symmetry?: string[];
  site?: string;
  pins: LefPin[];
  obstructions: LefObstruction[];
}

export interface LefVia {
  name: string;
  resistance?: number;
}

export interface LefLibrary {
  version?: string;
  busBitChars?: string;
  dividerChar?: string;
  unitsDbuPerMicron?: number;
  manufacturingGrid?: number;
  sites: LefSite[];
  layers: LefLayer[];
  vias: LefVia[];
  macros: LefMacro[];
  warnings: string[];
}

export class LefParseError extends Error {
  constructor(msg: string, public readonly line: number) {
    super(`LEF parse error at line ${line}: ${msg}`);
  }
}

/* --------------------------------------------------------------------- */
/* Tokenizer                                                              */
/* --------------------------------------------------------------------- */

interface Tok { v: string; line: number; }

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let line = 1;
  const n = src.length;
  let i = 0;
  while (i < n) {
    const c = src[i];
    if (c === '\n') { line++; i++; continue; }
    if (c === ' ' || c === '\t' || c === '\r') { i++; continue; }
    // Line comment.
    if (c === '#') {
      while (i < n && src[i] !== '\n') i++;
      continue;
    }
    if (c === ';') { out.push({ v: ';', line }); i++; continue; }
    // Quoted string — keep the quotes out of the token value.
    if (c === '"') {
      let j = i + 1;
      while (j < n && src[j] !== '"') {
        if (src[j] === '\n') line++;
        j++;
      }
      out.push({ v: src.slice(i + 1, j), line });
      i = j + 1;
      continue;
    }
    // Anything else runs until whitespace or ';'.
    let j = i;
    while (j < n && !/[\s;]/.test(src[j])) j++;
    out.push({ v: src.slice(i, j), line });
    i = j;
  }
  return out;
}

/* --------------------------------------------------------------------- */
/* Parser                                                                 */
/* --------------------------------------------------------------------- */

export function parseLef(src: string): LefLibrary {
  const tokens = tokenize(src);
  let p = 0;

  const lib: LefLibrary = {
    sites: [], layers: [], vias: [], macros: [], warnings: [],
  };

  const peek = (o = 0) => tokens[p + o];
  const eof = () => p >= tokens.length;
  const eat = () => tokens[p++];
  const expect = (v: string) => {
    if (eof() || tokens[p].v !== v) {
      throw new LefParseError(`expected "${v}", got "${eof() ? 'EOF' : tokens[p].v}"`, eof() ? -1 : tokens[p].line);
    }
    return eat();
  };
  const eatSemi = () => { while (!eof() && tokens[p].v !== ';') p++; if (!eof()) p++; };
  const num = (s: string) => {
    const n = Number(s);
    if (!Number.isFinite(n)) throw new LefParseError(`not a number: "${s}"`, tokens[p - 1]?.line ?? -1);
    return n;
  };

  while (!eof()) {
    const t = eat();
    switch (t.v) {
      case 'VERSION':        lib.version = eat().v; eatSemi(); break;
      case 'BUSBITCHARS':    lib.busBitChars = eat().v; eatSemi(); break;
      case 'DIVIDERCHAR':    lib.dividerChar = eat().v; eatSemi(); break;
      case 'NAMESCASESENSITIVE':
      case 'NOWIREEXTENSIONATPIN':
      case 'CLEARANCEMEASURE':
      case 'USEMINSPACING':
        eatSemi(); break;
      case 'MANUFACTURINGGRID':
        lib.manufacturingGrid = num(eat().v); eatSemi(); break;
      case 'UNITS':          parseUnits(); break;
      case 'SITE':           parseSite(); break;
      case 'LAYER':          parseLayer(); break;
      case 'VIA':            parseVia(); break;
      case 'VIARULE':        skipBlockUntil('VIARULE'); break;
      case 'PROPERTYDEFINITIONS':
        skipBlockUntil('PROPERTYDEFINITIONS'); break;
      case 'NONDEFAULTRULE':
        skipBlockUntil('NONDEFAULTRULE'); break;
      case 'MACRO':          parseMacro(); break;
      case 'END':
        // A bare "END" token (e.g. "END LIBRARY"). Consume the optional name.
        if (!eof() && tokens[p].v !== ';') p++;
        break;
      case 'BEGINEXT':       skipBlockUntil('BEGINEXT'); break;
      default:
        // Unknown top-level token — consume to next ';' and warn once.
        lib.warnings.push(`line ${t.line}: ignored top-level token "${t.v}"`);
        eatSemi();
    }
  }

  return lib;

  function parseUnits() {
    while (!eof()) {
      const t = eat();
      if (t.v === 'END') {
        if (!eof() && tokens[p].v === 'UNITS') p++;
        return;
      }
      if (t.v === 'DATABASE') {
        // DATABASE MICRONS <n> ;
        expect('MICRONS');
        lib.unitsDbuPerMicron = num(eat().v);
        eatSemi();
      } else {
        eatSemi();
      }
    }
  }

  function parseSite() {
    const name = eat().v;
    const site: LefSite = { name, width: 0, height: 0 };
    while (!eof()) {
      const t = eat();
      if (t.v === 'END') {
        // Optional trailing name.
        if (!eof() && tokens[p].v === name) p++;
        lib.sites.push(site);
        return;
      }
      if (t.v === 'CLASS')      { site.class = eat().v; eatSemi(); }
      else if (t.v === 'SIZE')  {
        site.width = num(eat().v);
        expect('BY');
        site.height = num(eat().v);
        eatSemi();
      }
      else if (t.v === 'SYMMETRY') {
        const syms: string[] = [];
        while (!eof() && tokens[p].v !== ';') syms.push(eat().v);
        eatSemi();
        site.symmetry = syms;
      }
      else eatSemi();
    }
  }

  function parseLayer() {
    const name = eat().v;
    const layer: LefLayer = { name, type: 'OTHER' };
    while (!eof()) {
      const t = eat();
      if (t.v === 'END') {
        if (!eof() && tokens[p].v === name) p++;
        lib.layers.push(layer);
        return;
      }
      if (t.v === 'TYPE') {
        const v = eat().v.toUpperCase();
        layer.type = (['ROUTING','CUT','MASTERSLICE','OVERLAP','IMPLANT'] as const)
          .includes(v as any) ? v as LefLayerType : 'OTHER';
        eatSemi();
      }
      else if (t.v === 'DIRECTION') {
        const d = eat().v.toUpperCase();
        layer.direction = d === 'VERTICAL' ? 'VERTICAL' : 'HORIZONTAL';
        eatSemi();
      }
      else if (t.v === 'PITCH')   { layer.pitch   = num(eat().v); eatSemi(); }
      else if (t.v === 'WIDTH')   { layer.width   = num(eat().v); eatSemi(); }
      else if (t.v === 'SPACING') { layer.spacing = num(eat().v); eatSemi(); }
      else if (t.v === 'OFFSET')  { layer.offset  = num(eat().v); eatSemi(); }
      else eatSemi();
    }
  }

  function parseVia() {
    const name = eat().v;
    const via: LefVia = { name };
    while (!eof()) {
      const t = eat();
      if (t.v === 'END') {
        if (!eof() && tokens[p].v === name) p++;
        lib.vias.push(via);
        return;
      }
      if (t.v === 'RESISTANCE') { via.resistance = num(eat().v); eatSemi(); }
      else eatSemi();
    }
  }

  function parseMacro() {
    const name = eat().v;
    const macro: LefMacro = {
      name, origin: { x: 0, y: 0 }, size: { width: 0, height: 0 },
      pins: [], obstructions: [],
    };
    while (!eof()) {
      const t = eat();
      if (t.v === 'END') {
        if (!eof() && tokens[p].v === name) p++;
        lib.macros.push(macro);
        return;
      }
      switch (t.v) {
        case 'CLASS': {
          const parts: string[] = [];
          while (!eof() && tokens[p].v !== ';') parts.push(eat().v);
          eatSemi();
          macro.class = parts.join(' ');
          break;
        }
        case 'ORIGIN':
          macro.origin = { x: num(eat().v), y: num(eat().v) };
          eatSemi(); break;
        case 'SIZE':
          macro.size.width = num(eat().v);
          expect('BY');
          macro.size.height = num(eat().v);
          eatSemi(); break;
        case 'SYMMETRY': {
          const syms: string[] = [];
          while (!eof() && tokens[p].v !== ';') syms.push(eat().v);
          eatSemi();
          macro.symmetry = syms;
          break;
        }
        case 'SITE':
          macro.site = eat().v; eatSemi(); break;
        case 'FOREIGN': {
          const fname = eat().v;
          // Optional (x y).
          let x = 0, y = 0;
          if (!eof() && tokens[p].v !== ';') {
            x = num(eat().v); y = num(eat().v);
          }
          macro.foreign = { name: fname, x, y };
          eatSemi();
          break;
        }
        case 'PIN':
          macro.pins.push(parsePin());
          break;
        case 'OBS':
          macro.obstructions.push(...parseObs());
          break;
        default:
          eatSemi();
      }
    }
  }

  function parsePin(): LefPin {
    const name = eat().v;
    const pin: LefPin = { name, ports: [] };
    while (!eof()) {
      const t = eat();
      if (t.v === 'END') {
        if (!eof() && tokens[p].v === name) p++;
        return pin;
      }
      switch (t.v) {
        case 'DIRECTION': {
          const d = eat().v.toUpperCase() as LefPin['direction'];
          pin.direction = d; eatSemi(); break;
        }
        case 'USE': {
          const u = eat().v.toUpperCase() as LefPin['use'];
          pin.use = u; eatSemi(); break;
        }
        case 'PORT': {
          pin.ports.push(parsePort());
          break;
        }
        default:
          eatSemi();
      }
    }
    return pin;
  }

  /** PORT block — read LAYER / RECT statements until END. */
  function parsePort(): LefPort {
    const port: LefPort = { rects: [] };
    while (!eof()) {
      const t = eat();
      if (t.v === 'END') return port;
      if (t.v === 'LAYER') { port.layer = eat().v; eatSemi(); }
      else if (t.v === 'RECT') {
        port.rects.push({
          xl: num(eat().v), yl: num(eat().v),
          xh: num(eat().v), yh: num(eat().v),
        });
        eatSemi();
      } else eatSemi();
    }
    return port;
  }

  /** OBS block — LAYER/RECT pairs, similar to PORT but grouped by layer. */
  function parseObs(): LefObstruction[] {
    const res: LefObstruction[] = [];
    let current: LefObstruction | null = null;
    while (!eof()) {
      const t = eat();
      if (t.v === 'END') {
        if (current) res.push(current);
        return res;
      }
      if (t.v === 'LAYER') {
        if (current) res.push(current);
        current = { layer: eat().v, rects: [] };
        eatSemi();
      } else if (t.v === 'RECT' && current) {
        current.rects.push({
          xl: num(eat().v), yl: num(eat().v),
          xh: num(eat().v), yh: num(eat().v),
        });
        eatSemi();
      } else eatSemi();
    }
    return res;
  }

  /** Skip to matching "END <keyword>" — used for blocks we don't model. */
  function skipBlockUntil(keyword: string) {
    let depth = 1;
    while (!eof() && depth > 0) {
      const t = eat();
      if (t.v === 'END') {
        if (!eof() && tokens[p].v === keyword) { p++; depth--; }
        else depth--;
      } else if (t.v === keyword) {
        depth++;
      }
    }
  }
}

/** Look up a macro by name — convenience for DEF cross-referencing. */
export function getMacro(lib: LefLibrary, name: string): LefMacro | undefined {
  return lib.macros.find(m => m.name === name);
}
