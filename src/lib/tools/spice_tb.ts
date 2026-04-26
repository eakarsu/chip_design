/**
 * SPICE testbench emitter.
 *
 * Given a Verilog/Spice DUT name and a set of stimuli, emit a SPICE
 * netlist that exercises the DUT with .tran/.dc/.ac analyses. We
 * support:
 *   - DC sweep on a named source
 *   - .tran with a piecewise-linear (PWL) input
 *   - .ac sweep with frequency range
 *   - Simple `.measure` directives for Vout settling, gain, BW.
 *
 * Output is a deck string ready to feed ngspice / hspice.
 */
export type SpiceAnalysis =
  | { kind: 'tran'; tstop: number; tstep: number }
  | { kind: 'dc'; source: string; from: number; to: number; step: number }
  | { kind: 'ac'; from: number; to: number; pointsPerDecade: number };

export interface SpiceTbSpec {
  /** Top instance name. */
  dut: string;
  /** Subckt file include path. */
  subcktPath: string;
  /** Pin list, in order, with stimulus type. */
  pins: { name: string; net: string }[];
  /** Power rails: { name, voltage } e.g., VDD=1.0, GND=0. */
  rails: { name: string; node: string; volts: number }[];
  /** Source definitions. */
  sources: ({
    name: string;
    posNode: string;
    negNode: string;
  } & (
    | { kind: 'dc'; volts: number }
    | { kind: 'pwl'; pts: { t: number; v: number }[] }
    | { kind: 'sin'; offset: number; amp: number; freq: number }
    | { kind: 'ac'; mag: number }
  ))[];
  /** Analyses to run (one or more). */
  analyses: SpiceAnalysis[];
  /** Optional measurements. */
  measures?: { name: string; expr: string }[];
}

export interface SpiceTbResult {
  /** Full netlist text. */
  netlist: string;
  /** Line count. */
  lines: number;
}

export function emitSpiceTb(spec: SpiceTbSpec): SpiceTbResult {
  if (!spec.dut) throw new Error('dut required');
  if (!spec.pins?.length) throw new Error('at least one pin required');
  if (!spec.analyses?.length) throw new Error('at least one analysis required');
  const out: string[] = [];
  out.push(`* SPICE testbench for ${spec.dut} (auto-generated)`);
  out.push(`.include "${spec.subcktPath}"`);
  out.push('');
  // Power rails
  for (const r of spec.rails) {
    out.push(`V${r.name} ${r.node} 0 DC ${r.volts}`);
  }
  out.push('');
  // Sources
  for (const s of spec.sources) {
    if (s.kind === 'dc') {
      out.push(`V${s.name} ${s.posNode} ${s.negNode} DC ${s.volts}`);
    } else if (s.kind === 'pwl') {
      const pts = s.pts.map(p => `${p.t} ${p.v}`).join(' ');
      out.push(`V${s.name} ${s.posNode} ${s.negNode} PWL(${pts})`);
    } else if (s.kind === 'sin') {
      out.push(`V${s.name} ${s.posNode} ${s.negNode} SIN(${s.offset} ${s.amp} ${s.freq})`);
    } else {
      out.push(`V${s.name} ${s.posNode} ${s.negNode} AC ${s.mag}`);
    }
  }
  out.push('');
  // DUT instance
  const pinList = spec.pins.map(p => p.net).join(' ');
  out.push(`X${spec.dut} ${pinList} ${spec.dut}`);
  out.push('');
  // Analyses
  for (const a of spec.analyses) {
    if (a.kind === 'tran') {
      out.push(`.tran ${a.tstep} ${a.tstop}`);
    } else if (a.kind === 'dc') {
      out.push(`.dc V${a.source} ${a.from} ${a.to} ${a.step}`);
    } else {
      out.push(`.ac dec ${a.pointsPerDecade} ${a.from} ${a.to}`);
    }
  }
  out.push('');
  // Measurements
  if (spec.measures?.length) {
    for (const m of spec.measures) {
      out.push(`.measure ${m.name} ${m.expr}`);
    }
    out.push('');
  }
  out.push('.end');
  const netlist = out.join('\n');
  return { netlist, lines: out.length };
}
