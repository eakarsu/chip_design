/**
 * Synopsys Design Constraints (SDC) reader.
 *
 * SDC is a Tcl-like command language. We parse it using a lightweight
 * tokenizer that understands enough Tcl syntax to extract the commands STA
 * actually cares about — no eval, no variable substitution, no expression
 * arithmetic.
 *
 * Supported commands:
 *   - create_clock -period P [-name N] [-waveform {r f}] [get_ports p]
 *   - create_generated_clock ... (captured structurally, divided/multiplied)
 *   - set_input_delay  -clock CLK [-max|-min] VAL ports
 *   - set_output_delay -clock CLK [-max|-min] VAL ports
 *   - set_false_path [-from F] [-to T] [-through X]
 *   - set_multicycle_path N [-setup|-hold] [-from F] [-to T]
 *   - set_max_delay VAL [-from F] [-to T]
 *   - set_min_delay VAL [-from F] [-to T]
 *   - set_clock_groups -asynchronous|-exclusive -group {g1} -group {g2}
 *   - set_clock_uncertainty VAL [-setup|-hold] [-from F] [-to T]
 *   - set_load / set_driving_cell (captured, no interpretation beyond names)
 *
 * Anything else is ignored but remembered in `warnings`.
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface Clock {
  name: string;
  period: number;
  /** Source object, usually a port or pin reference like `get_ports clk`. */
  source: string | null;
  /** [rise, fall] — defaults to [0, period/2] if absent. */
  waveform: [number, number];
}

export interface GeneratedClock {
  name: string;
  source: string | null;
  masterClock: string | null;
  divideBy: number | null;
  multiplyBy: number | null;
  invert: boolean;
}

export interface IODelay {
  /** 'input' means the delay is on a primary input; 'output' on a primary output. */
  kind: 'input' | 'output';
  clock: string;
  /** Max / min — absent means the user didn't specify, interpret as both. */
  max: boolean;
  min: boolean;
  delay: number;
  /** Target port expression (e.g. `{a b}` or `[get_ports d_in]`). */
  ports: string;
  clockFall: boolean;
}

export interface FalsePath {
  from: string | null;
  to: string | null;
  through: string | null;
  setupOnly: boolean;
  holdOnly: boolean;
}

export interface MulticyclePath {
  cycles: number;
  setup: boolean;
  hold: boolean;
  from: string | null;
  to: string | null;
  through: string | null;
}

export interface MaxMinDelay {
  kind: 'max' | 'min';
  delay: number;
  from: string | null;
  to: string | null;
  through: string | null;
}

export interface ClockGroups {
  kind: 'asynchronous' | 'exclusive' | 'logically_exclusive' | 'physically_exclusive';
  groups: string[][]; // each inner array = one -group
}

export interface ClockUncertainty {
  value: number;
  setup: boolean;
  hold: boolean;
  from: string | null;
  to: string | null;
}

export interface SdcConstraints {
  clocks: Clock[];
  generatedClocks: GeneratedClock[];
  ioDelays: IODelay[];
  falsePaths: FalsePath[];
  multicyclePaths: MulticyclePath[];
  maxMinDelays: MaxMinDelay[];
  clockGroups: ClockGroups[];
  clockUncertainties: ClockUncertainty[];
  /** Raw commands we recognised but don't model in depth. */
  other: Array<{ command: string; args: string[] }>;
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Tokenizer — a subset of Tcl good enough for SDC.
// ---------------------------------------------------------------------------

type Tok = { value: string; line: number };

function tokenizeSdc(src: string): Tok[][] {
  // Returns a list of commands, each a list of tokens.
  const cmds: Tok[][] = [];
  let current: Tok[] = [];
  let i = 0;
  let line = 1;
  const n = src.length;

  const pushTok = (value: string, l: number) => current.push({ value, line: l });
  const endCmd = () => { if (current.length) { cmds.push(current); current = []; } };

  while (i < n) {
    const c = src[i];

    // Comment: starts with # at the start of a command position.
    if (c === '#' && (current.length === 0 || src[i - 1] === '\n')) {
      while (i < n && src[i] !== '\n') i++;
      continue;
    }
    // Command terminators.
    if (c === '\n' || c === ';') {
      if (c === '\n') line++;
      endCmd();
      i++;
      continue;
    }
    // Line continuation: `\` immediately followed by newline.
    if (c === '\\' && src[i + 1] === '\n') { i += 2; line++; continue; }
    // Whitespace inside a command.
    if (c === ' ' || c === '\t' || c === '\r') { i++; continue; }

    // Braced word: {...}, balanced.
    if (c === '{') {
      const startL = line;
      let depth = 1;
      let s = '';
      i++;
      while (i < n && depth > 0) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') { depth--; if (depth === 0) break; }
        if (src[i] === '\n') line++;
        s += src[i]; i++;
      }
      if (i < n) i++; // closing }
      pushTok(`{${s}}`, startL);
      continue;
    }

    // Bracketed command substitution: [...] — we keep the raw text.
    if (c === '[') {
      const startL = line;
      let depth = 1;
      let s = '';
      i++;
      while (i < n && depth > 0) {
        if (src[i] === '[') depth++;
        else if (src[i] === ']') { depth--; if (depth === 0) break; }
        if (src[i] === '\n') line++;
        s += src[i]; i++;
      }
      if (i < n) i++; // closing ]
      pushTok(`[${s}]`, startL);
      continue;
    }

    // Double-quoted string.
    if (c === '"') {
      const startL = line;
      let s = '';
      i++;
      while (i < n && src[i] !== '"') {
        if (src[i] === '\\' && i + 1 < n) { s += src[i + 1]; i += 2; continue; }
        if (src[i] === '\n') line++;
        s += src[i]; i++;
      }
      if (i < n) i++; // closing "
      pushTok(s, startL);
      continue;
    }

    // Bare word (until whitespace or special char).
    const startL = line;
    let s = '';
    while (i < n && !/[\s;{}\[\]"]/.test(src[i])) { s += src[i]; i++; }
    if (s.length > 0) pushTok(s, startL);
  }
  endCmd();
  return cmds;
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

/** Strip surrounding braces from a token value if present. */
function unbrace(s: string): string {
  if (s.startsWith('{') && s.endsWith('}')) return s.slice(1, -1).trim();
  return s;
}

/** Extract the last identifier from an expression like `[get_ports clk]` or
 *  `[get_clocks {clk1 clk2}]` or `clk`. Best-effort: used for `-clock` etc. */
function resolveName(expr: string): string {
  let s = expr.trim();
  if (s.startsWith('[') && s.endsWith(']')) s = s.slice(1, -1).trim();
  // get_clocks / get_ports / get_pins — take the argument.
  const m = s.match(/^(?:get_(?:clocks|ports|pins|nets|cells))\s+(.*)$/);
  if (m) s = m[1].trim();
  s = unbrace(s);
  // If still a list, return the whole string; STA can split later.
  return s;
}

function toNumber(s: string, warnings: string[]): number {
  const v = Number(s);
  if (!Number.isFinite(v)) {
    warnings.push(`non-numeric value '${s}' — treated as 0`);
    return 0;
  }
  return v;
}

interface ArgView {
  args: string[];
  pos: number;
}

function hasFlag(v: ArgView, flag: string): boolean {
  const i = v.args.indexOf(flag);
  if (i === -1) return false;
  v.args.splice(i, 1);
  return true;
}

/** Consume `-flag value` and return the value, or null if the flag isn't there. */
function takeOpt(v: ArgView, flag: string): string | null {
  const i = v.args.indexOf(flag);
  if (i === -1) return null;
  if (i + 1 >= v.args.length) return null;
  const val = v.args[i + 1];
  v.args.splice(i, 2);
  return val;
}

function takeAll(v: ArgView, flag: string): string[] {
  const out: string[] = [];
  while (true) {
    const i = v.args.indexOf(flag);
    if (i === -1) break;
    if (i + 1 >= v.args.length) break;
    out.push(v.args[i + 1]);
    v.args.splice(i, 2);
  }
  return out;
}

/** Parse a waveform braced-list "0 5" into [0, 5]. */
function parseWaveform(s: string | null): [number, number] | null {
  if (s === null) return null;
  const parts = unbrace(s).trim().split(/\s+/).map(Number);
  if (parts.length < 2 || parts.some(x => !Number.isFinite(x))) return null;
  return [parts[0], parts[1]];
}

function parseCreateClock(args: string[], out: SdcConstraints): void {
  const v: ArgView = { args: [...args], pos: 0 };
  const period = takeOpt(v, '-period');
  const name = takeOpt(v, '-name');
  const wavRaw = takeOpt(v, '-waveform');
  hasFlag(v, '-add');
  // Whatever's left is typically the source object.
  const source = v.args.length ? v.args.join(' ') : null;
  if (period === null) {
    out.warnings.push(`create_clock missing -period — ignored`);
    return;
  }
  const per = toNumber(period, out.warnings);
  const wav = parseWaveform(wavRaw) ?? [0, per / 2];
  out.clocks.push({
    name: name ?? (source ? resolveName(source) : 'clk'),
    period: per,
    source: source ? resolveName(source) : null,
    waveform: wav,
  });
}

function parseCreateGeneratedClock(args: string[], out: SdcConstraints): void {
  const v: ArgView = { args: [...args], pos: 0 };
  const name = takeOpt(v, '-name');
  const source = takeOpt(v, '-source');
  const master = takeOpt(v, '-master_clock');
  const divideBy = takeOpt(v, '-divide_by');
  const multiplyBy = takeOpt(v, '-multiply_by');
  const invert = hasFlag(v, '-invert');
  out.generatedClocks.push({
    name: name ?? 'gen_clk',
    source: source ? resolveName(source) : null,
    masterClock: master ? resolveName(master) : null,
    divideBy: divideBy ? toNumber(divideBy, out.warnings) : null,
    multiplyBy: multiplyBy ? toNumber(multiplyBy, out.warnings) : null,
    invert,
  });
}

function parseSetIODelay(kind: 'input' | 'output', args: string[], out: SdcConstraints): void {
  const v: ArgView = { args: [...args], pos: 0 };
  const clock = takeOpt(v, '-clock');
  const clockFall = hasFlag(v, '-clock_fall');
  const max = hasFlag(v, '-max');
  const min = hasFlag(v, '-min');
  hasFlag(v, '-add_delay');
  hasFlag(v, '-rise');
  hasFlag(v, '-fall');
  // The numeric value is conventionally the first non-flag token.
  let delayTok: string | null = null;
  for (let i = 0; i < v.args.length; i++) {
    const t = v.args[i];
    if (!t.startsWith('-') && !Number.isNaN(Number(t))) {
      delayTok = t;
      v.args.splice(i, 1);
      break;
    }
  }
  if (delayTok === null) {
    out.warnings.push(`set_${kind}_delay missing delay value — ignored`);
    return;
  }
  const ports = v.args.join(' ').trim();
  out.ioDelays.push({
    kind,
    clock: clock ? resolveName(clock) : '',
    max: max || (!max && !min),
    min: min || (!max && !min),
    delay: toNumber(delayTok, out.warnings),
    ports: ports ? resolveName(ports) : '',
    clockFall,
  });
}

function parseFalsePath(args: string[], out: SdcConstraints): void {
  const v: ArgView = { args: [...args], pos: 0 };
  const from = takeOpt(v, '-from');
  const to = takeOpt(v, '-to');
  const through = takeOpt(v, '-through');
  const setup = hasFlag(v, '-setup');
  const hold = hasFlag(v, '-hold');
  out.falsePaths.push({
    from: from ? resolveName(from) : null,
    to: to ? resolveName(to) : null,
    through: through ? resolveName(through) : null,
    setupOnly: setup && !hold,
    holdOnly: hold && !setup,
  });
}

function parseMulticycle(args: string[], out: SdcConstraints): void {
  const v: ArgView = { args: [...args], pos: 0 };
  const setup = hasFlag(v, '-setup');
  const hold = hasFlag(v, '-hold');
  const from = takeOpt(v, '-from');
  const to = takeOpt(v, '-to');
  const through = takeOpt(v, '-through');
  hasFlag(v, '-start');
  hasFlag(v, '-end');
  const cyclesTok = v.args.find(t => !t.startsWith('-') && /^-?\d+$/.test(t));
  if (!cyclesTok) {
    out.warnings.push(`set_multicycle_path missing cycle count — ignored`);
    return;
  }
  out.multicyclePaths.push({
    cycles: parseInt(cyclesTok, 10),
    setup: setup || (!setup && !hold),
    hold,
    from: from ? resolveName(from) : null,
    to: to ? resolveName(to) : null,
    through: through ? resolveName(through) : null,
  });
}

function parseMaxMinDelay(kind: 'max' | 'min', args: string[], out: SdcConstraints): void {
  const v: ArgView = { args: [...args], pos: 0 };
  const from = takeOpt(v, '-from');
  const to = takeOpt(v, '-to');
  const through = takeOpt(v, '-through');
  const delayTok = v.args.find(t => !t.startsWith('-'));
  if (!delayTok) {
    out.warnings.push(`set_${kind}_delay missing value — ignored`);
    return;
  }
  out.maxMinDelays.push({
    kind,
    delay: toNumber(delayTok, out.warnings),
    from: from ? resolveName(from) : null,
    to: to ? resolveName(to) : null,
    through: through ? resolveName(through) : null,
  });
}

function parseClockGroups(args: string[], out: SdcConstraints): void {
  const v: ArgView = { args: [...args], pos: 0 };
  const async_ = hasFlag(v, '-asynchronous');
  const excl = hasFlag(v, '-exclusive');
  const logExcl = hasFlag(v, '-logically_exclusive');
  const physExcl = hasFlag(v, '-physically_exclusive');
  takeOpt(v, '-name');
  const groupsRaw = takeAll(v, '-group');
  const groups = groupsRaw.map(g => unbrace(g).trim().split(/\s+/).filter(Boolean));
  const kind: ClockGroups['kind'] =
    physExcl ? 'physically_exclusive' :
    logExcl  ? 'logically_exclusive' :
    excl     ? 'exclusive' :
    /* default */ 'asynchronous';
  void async_;
  out.clockGroups.push({ kind, groups });
}

function parseClockUncertainty(args: string[], out: SdcConstraints): void {
  const v: ArgView = { args: [...args], pos: 0 };
  const setup = hasFlag(v, '-setup');
  const hold = hasFlag(v, '-hold');
  const from = takeOpt(v, '-from');
  const to = takeOpt(v, '-to');
  const valueTok = v.args.find(t => !t.startsWith('-') && !Number.isNaN(Number(t)));
  if (!valueTok) {
    out.warnings.push(`set_clock_uncertainty missing value — ignored`);
    return;
  }
  out.clockUncertainties.push({
    value: toNumber(valueTok, out.warnings),
    setup: setup || (!setup && !hold),
    hold: hold   || (!setup && !hold),
    from: from ? resolveName(from) : null,
    to:   to   ? resolveName(to)   : null,
  });
}

export function parseSdc(src: string): SdcConstraints {
  const out: SdcConstraints = {
    clocks: [], generatedClocks: [], ioDelays: [], falsePaths: [],
    multicyclePaths: [], maxMinDelays: [], clockGroups: [],
    clockUncertainties: [], other: [], warnings: [],
  };

  for (const cmd of tokenizeSdc(src)) {
    if (cmd.length === 0) continue;
    const name = cmd[0].value;
    const args = cmd.slice(1).map(t => t.value);
    try {
      switch (name) {
        case 'create_clock':             parseCreateClock(args, out); break;
        case 'create_generated_clock':   parseCreateGeneratedClock(args, out); break;
        case 'set_input_delay':          parseSetIODelay('input', args, out); break;
        case 'set_output_delay':         parseSetIODelay('output', args, out); break;
        case 'set_false_path':           parseFalsePath(args, out); break;
        case 'set_multicycle_path':      parseMulticycle(args, out); break;
        case 'set_max_delay':            parseMaxMinDelay('max', args, out); break;
        case 'set_min_delay':            parseMaxMinDelay('min', args, out); break;
        case 'set_clock_groups':         parseClockGroups(args, out); break;
        case 'set_clock_uncertainty':    parseClockUncertainty(args, out); break;
        // Commands we store structurally without deep modelling.
        case 'set_load':
        case 'set_driving_cell':
        case 'set_case_analysis':
        case 'set_disable_timing':
        case 'set_units':
        case 'set_wire_load_model':
        case 'current_design':
          out.other.push({ command: name, args });
          break;
        default:
          // Unknown — record, keep going.
          out.other.push({ command: name, args });
          out.warnings.push(`unknown command '${name}' at line ${cmd[0].line}`);
      }
    } catch (e) {
      const err = e as Error;
      out.warnings.push(`error parsing '${name}' at line ${cmd[0].line}: ${err.message}`);
    }
  }
  return out;
}
