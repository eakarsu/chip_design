/**
 * DEF (Design Exchange Format) parser + writer.
 *
 * Covers the sections actually used by the placement / routing / visualization
 * paths in this project:
 *
 *   - DESIGN, VERSION, UNITS, DIVIDERCHAR, BUSBITCHARS
 *   - DIEAREA
 *   - ROW
 *   - TRACKS
 *   - GCELLGRID
 *   - COMPONENTS
 *       componentName macroName [ PLACED | FIXED | UNPLACED ] ( x y ) N ;
 *   - PINS
 *       pinName NET net DIRECTION dir USE use LAYER l ( xl yl ) ( xh yh )
 *       [ PLACED | FIXED ] ( x y ) orient ;
 *   - NETS / SPECIALNETS
 *       netName ( comp pin ) ( comp pin ) ... ;
 *
 * Everything uses DEF's database-unit semantics: integer "DBU" values, with
 * an external "UNITS DISTANCE MICRONS <n>" section telling you how many DBU
 * make up one micron. We store both the raw DBU integers and resolved
 * micron floats, so callers don't need to know the scale.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

export interface DefUnits { dbuPerMicron: number; }

export interface DefDieArea {
  points: { x: number; y: number }[]; // in DBU
}

export interface DefRow {
  name: string;
  site: string;
  x: number; y: number;  // DBU
  orient: string;
  numX: number; numY: number;
  stepX: number; stepY: number;
}

export interface DefTracks {
  axis: 'X' | 'Y';
  start: number;
  count: number;
  step: number;
  layers: string[];
}

export type DefPlacement = 'PLACED' | 'FIXED' | 'UNPLACED' | 'COVER';

export interface DefComponent {
  name: string;
  macro: string;
  placement: DefPlacement;
  x?: number; y?: number;    // DBU
  orient?: string;
}

export interface DefPin {
  name: string;
  net: string;
  direction?: 'INPUT' | 'OUTPUT' | 'INOUT' | 'FEEDTHRU';
  use?: 'SIGNAL' | 'POWER' | 'GROUND' | 'CLOCK' | 'ANALOG';
  layer?: string;
  rect?: { xl: number; yl: number; xh: number; yh: number };
  placement?: DefPlacement;
  x?: number; y?: number;
  orient?: string;
}

export interface DefNetConn { component: string; pin: string; }

export interface DefNet {
  name: string;
  connections: DefNetConn[];
  use?: string;
}

export interface DefDesign {
  version?: string;
  designName: string;
  units?: DefUnits;
  dividerChar?: string;
  busBitChars?: string;
  dieArea?: DefDieArea;
  rows: DefRow[];
  tracks: DefTracks[];
  components: DefComponent[];
  pins: DefPin[];
  nets: DefNet[];
  specialNets: DefNet[];
  warnings: string[];
}

export class DefParseError extends Error {
  constructor(msg: string, public readonly line: number) {
    super(`DEF parse error at line ${line}: ${msg}`);
  }
}

/* --------------------------------------------------------------------- */
/* Tokenizer                                                              */
/* --------------------------------------------------------------------- */

interface Tok { v: string; line: number; }

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let line = 1;
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === '\n') { line++; i++; continue; }
    if (/\s/.test(c)) { i++; continue; }
    if (c === '#') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === ';' || c === '(' || c === ')') { out.push({ v: c, line }); i++; continue; }
    if (c === '"') {
      let j = i + 1;
      while (j < n && src[j] !== '"') { if (src[j] === '\n') line++; j++; }
      out.push({ v: src.slice(i + 1, j), line });
      i = j + 1;
      continue;
    }
    let j = i;
    while (j < n && !/[\s;()]/.test(src[j])) j++;
    out.push({ v: src.slice(i, j), line });
    i = j;
  }
  return out;
}

/* --------------------------------------------------------------------- */
/* Parser                                                                 */
/* --------------------------------------------------------------------- */

export function parseDef(src: string): DefDesign {
  const tokens = tokenize(src);
  let p = 0;

  const def: DefDesign = {
    designName: '', rows: [], tracks: [],
    components: [], pins: [], nets: [], specialNets: [], warnings: [],
  };

  const peek = (o = 0) => tokens[p + o];
  const eof = () => p >= tokens.length;
  const eat = () => tokens[p++];
  const expect = (v: string) => {
    if (eof() || tokens[p].v !== v) {
      throw new DefParseError(`expected "${v}", got "${eof() ? 'EOF' : tokens[p].v}"`, eof() ? -1 : tokens[p].line);
    }
    return eat();
  };
  const num = (s: string) => {
    const n = Number(s);
    if (!Number.isFinite(n)) throw new DefParseError(`not a number: "${s}"`, tokens[p - 1]?.line ?? -1);
    return n;
  };
  const eatSemi = () => { while (!eof() && tokens[p].v !== ';') p++; if (!eof()) p++; };
  /** Eat "( x y )" and return the integer coords. */
  const readPt = () => {
    expect('(');
    const x = num(eat().v);
    const y = num(eat().v);
    expect(')');
    return { x, y };
  };

  while (!eof()) {
    const t = eat();
    switch (t.v) {
      case 'VERSION':       def.version = eat().v; eatSemi(); break;
      case 'DIVIDERCHAR':   def.dividerChar = eat().v; eatSemi(); break;
      case 'BUSBITCHARS':   def.busBitChars = eat().v; eatSemi(); break;
      case 'NAMESCASESENSITIVE': eatSemi(); break;
      case 'DESIGN':        def.designName = eat().v; eatSemi(); break;
      case 'UNITS':
        // UNITS DISTANCE MICRONS <n> ;
        expect('DISTANCE'); expect('MICRONS');
        def.units = { dbuPerMicron: num(eat().v) };
        eatSemi();
        break;
      case 'DIEAREA':       def.dieArea = parseDieArea(); break;
      case 'ROW':           def.rows.push(parseRow()); break;
      case 'TRACKS':        def.tracks.push(parseTracks()); break;
      case 'GCELLGRID':     eatSemi(); break;
      case 'COMPONENTS':    parseComponents(); break;
      case 'PINS':          parsePins(); break;
      case 'NETS':          parseNets(def.nets); break;
      case 'SPECIALNETS':   parseNets(def.specialNets); break;
      case 'VIAS':
      case 'REGIONS':
      case 'GROUPS':
      case 'BLOCKAGES':
      case 'STYLES':
      case 'PROPERTYDEFINITIONS':
      case 'NONDEFAULTRULES':
        skipSection(t.v);
        break;
      case 'END':
        // END DESIGN or an early END.
        if (!eof() && tokens[p].v === 'DESIGN') p++;
        return def;
      default:
        def.warnings.push(`line ${t.line}: ignored top-level token "${t.v}"`);
        eatSemi();
    }
  }
  return def;

  function parseDieArea(): DefDieArea {
    const pts: { x: number; y: number }[] = [];
    while (!eof() && tokens[p].v !== ';') pts.push(readPt());
    eatSemi();
    return { points: pts };
  }

  function parseRow(): DefRow {
    const name = eat().v;
    const site = eat().v;
    const x = num(eat().v);
    const y = num(eat().v);
    const orient = eat().v;
    let numX = 1, numY = 1, stepX = 0, stepY = 0;
    while (!eof() && tokens[p].v !== ';') {
      const kw = eat().v;
      if (kw === 'DO') {
        numX = num(eat().v);
        expect('BY');
        numY = num(eat().v);
      } else if (kw === 'STEP') {
        stepX = num(eat().v);
        stepY = num(eat().v);
      }
    }
    eatSemi();
    return { name, site, x, y, orient, numX, numY, stepX, stepY };
  }

  function parseTracks(): DefTracks {
    const axis = eat().v.toUpperCase() as 'X' | 'Y';
    const start = num(eat().v);
    expect('DO');
    const count = num(eat().v);
    expect('STEP');
    const step = num(eat().v);
    const layers: string[] = [];
    while (!eof() && tokens[p].v !== ';') {
      if (tokens[p].v === 'LAYER') {
        p++;
        while (!eof() && tokens[p].v !== ';') layers.push(eat().v);
      } else p++;
    }
    eatSemi();
    return { axis, start, count, step, layers };
  }

  function parseComponents() {
    const n = num(eat().v);
    eatSemi();
    for (let i = 0; i < n; i++) {
      // Each entry starts with '-'.
      expect('-');
      const name = eat().v;
      const macro = eat().v;
      const comp: DefComponent = { name, macro, placement: 'UNPLACED' };
      while (!eof() && tokens[p].v !== ';') {
        const kw = eat().v;
        if (kw === '+') continue;
        if (kw === 'PLACED' || kw === 'FIXED' || kw === 'COVER') {
          comp.placement = kw as DefPlacement;
          const pt = readPt();
          comp.x = pt.x; comp.y = pt.y;
          if (!eof() && tokens[p].v !== ';' && tokens[p].v !== '+') {
            comp.orient = eat().v;
          }
        } else if (kw === 'UNPLACED') {
          comp.placement = 'UNPLACED';
        } else {
          // skip token
        }
      }
      eatSemi();
      def.components.push(comp);
    }
    // END COMPONENTS
    while (!eof() && !(tokens[p].v === 'END' && tokens[p + 1]?.v === 'COMPONENTS')) p++;
    if (!eof()) { p += 2; }
  }

  function parsePins() {
    const n = num(eat().v);
    eatSemi();
    for (let i = 0; i < n; i++) {
      expect('-');
      const name = eat().v;
      const pin: DefPin = { name, net: '' };
      while (!eof() && tokens[p].v !== ';') {
        const kw = eat().v;
        if (kw === '+') continue;
        switch (kw) {
          case 'NET':        pin.net = eat().v; break;
          case 'DIRECTION':  pin.direction = eat().v as any; break;
          case 'USE':        pin.use = eat().v as any; break;
          case 'LAYER': {
            pin.layer = eat().v;
            const a = readPt();
            const b = readPt();
            pin.rect = { xl: a.x, yl: a.y, xh: b.x, yh: b.y };
            break;
          }
          case 'PLACED':
          case 'FIXED':
          case 'COVER': {
            pin.placement = kw as DefPlacement;
            const pt = readPt();
            pin.x = pt.x; pin.y = pt.y;
            if (!eof() && tokens[p].v !== ';' && tokens[p].v !== '+') {
              pin.orient = eat().v;
            }
            break;
          }
          default:
            // ignore unknown
        }
      }
      eatSemi();
      def.pins.push(pin);
    }
    while (!eof() && !(tokens[p].v === 'END' && tokens[p + 1]?.v === 'PINS')) p++;
    if (!eof()) { p += 2; }
  }

  function parseNets(target: DefNet[]) {
    const n = num(eat().v);
    eatSemi();
    for (let i = 0; i < n; i++) {
      expect('-');
      const name = eat().v;
      const net: DefNet = { name, connections: [] };
      // Connections are 0+ parenthesised (comp pin) pairs.
      while (!eof() && tokens[p].v === '(') {
        expect('(');
        const comp = eat().v;
        const pin = eat().v;
        expect(')');
        net.connections.push({ component: comp, pin });
      }
      while (!eof() && tokens[p].v !== ';') {
        const kw = eat().v;
        if (kw === '+' && !eof() && tokens[p].v === 'USE') {
          p++;
          net.use = eat().v;
        }
      }
      eatSemi();
      target.push(net);
    }
    // END NETS / END SPECIALNETS — consume either.
    while (!eof() && !(tokens[p].v === 'END' && (tokens[p + 1]?.v === 'NETS' || tokens[p + 1]?.v === 'SPECIALNETS'))) p++;
    if (!eof()) { p += 2; }
  }

  function skipSection(keyword: string) {
    // Consume until "END <keyword>".
    while (!eof()) {
      if (tokens[p].v === 'END' && tokens[p + 1]?.v === keyword) { p += 2; return; }
      p++;
    }
  }
}

/* --------------------------------------------------------------------- */
/* Writer                                                                 */
/* --------------------------------------------------------------------- */

/** Emit DEF text from a DefDesign. The output parses back with parseDef. */
export function writeDef(d: DefDesign): string {
  const out: string[] = [];
  out.push(`VERSION ${d.version ?? '5.8'} ;`);
  if (d.dividerChar) out.push(`DIVIDERCHAR "${d.dividerChar}" ;`);
  if (d.busBitChars) out.push(`BUSBITCHARS "${d.busBitChars}" ;`);
  out.push(`DESIGN ${d.designName || 'top'} ;`);
  if (d.units) out.push(`UNITS DISTANCE MICRONS ${d.units.dbuPerMicron} ;`);

  if (d.dieArea) {
    const pts = d.dieArea.points.map(pt => `( ${pt.x} ${pt.y} )`).join(' ');
    out.push(`DIEAREA ${pts} ;`);
  }

  for (const r of d.rows) {
    out.push(`ROW ${r.name} ${r.site} ${r.x} ${r.y} ${r.orient} DO ${r.numX} BY ${r.numY} STEP ${r.stepX} ${r.stepY} ;`);
  }
  for (const t of d.tracks) {
    const layers = t.layers.length ? ` LAYER ${t.layers.join(' ')}` : '';
    out.push(`TRACKS ${t.axis} ${t.start} DO ${t.count} STEP ${t.step}${layers} ;`);
  }

  if (d.components.length > 0) {
    out.push(`COMPONENTS ${d.components.length} ;`);
    for (const c of d.components) {
      const place = c.placement === 'UNPLACED'
        ? '+ UNPLACED'
        : `+ ${c.placement} ( ${c.x ?? 0} ${c.y ?? 0} ) ${c.orient ?? 'N'}`;
      out.push(`  - ${c.name} ${c.macro} ${place} ;`);
    }
    out.push('END COMPONENTS');
  }

  if (d.pins.length > 0) {
    out.push(`PINS ${d.pins.length} ;`);
    for (const pin of d.pins) {
      const parts: string[] = [`  - ${pin.name} + NET ${pin.net}`];
      if (pin.direction) parts.push(`+ DIRECTION ${pin.direction}`);
      if (pin.use)       parts.push(`+ USE ${pin.use}`);
      if (pin.layer && pin.rect) {
        parts.push(`+ LAYER ${pin.layer} ( ${pin.rect.xl} ${pin.rect.yl} ) ( ${pin.rect.xh} ${pin.rect.yh} )`);
      }
      if (pin.placement && pin.placement !== 'UNPLACED') {
        parts.push(`+ ${pin.placement} ( ${pin.x ?? 0} ${pin.y ?? 0} ) ${pin.orient ?? 'N'}`);
      }
      out.push(parts.join(' ') + ' ;');
    }
    out.push('END PINS');
  }

  if (d.nets.length > 0) {
    out.push(`NETS ${d.nets.length} ;`);
    for (const net of d.nets) {
      const conns = net.connections.map(c => `( ${c.component} ${c.pin} )`).join(' ');
      const use = net.use ? ` + USE ${net.use}` : '';
      out.push(`  - ${net.name} ${conns}${use} ;`);
    }
    out.push('END NETS');
  }

  if (d.specialNets.length > 0) {
    out.push(`SPECIALNETS ${d.specialNets.length} ;`);
    for (const net of d.specialNets) {
      const conns = net.connections.map(c => `( ${c.component} ${c.pin} )`).join(' ');
      const use = net.use ? ` + USE ${net.use}` : '';
      out.push(`  - ${net.name} ${conns}${use} ;`);
    }
    out.push('END SPECIALNETS');
  }

  out.push('END DESIGN');
  return out.join('\n') + '\n';
}

/** Scale DEF DBU coordinates to microns. Returns a shallow-copied Design. */
export function defToMicrons(d: DefDesign): DefDesign {
  const s = d.units?.dbuPerMicron ?? 1;
  const scale = (v?: number) => v === undefined ? v : v / s;
  return {
    ...d,
    dieArea: d.dieArea ? { points: d.dieArea.points.map(p => ({ x: p.x / s, y: p.y / s })) } : undefined,
    rows: d.rows.map(r => ({ ...r, x: r.x / s, y: r.y / s, stepX: r.stepX / s, stepY: r.stepY / s })),
    components: d.components.map(c => ({ ...c, x: scale(c.x), y: scale(c.y) })),
    pins: d.pins.map(pn => ({
      ...pn,
      x: scale(pn.x), y: scale(pn.y),
      rect: pn.rect ? { xl: pn.rect.xl / s, yl: pn.rect.yl / s, xh: pn.rect.xh / s, yh: pn.rect.yh / s } : undefined,
    })),
  };
}
