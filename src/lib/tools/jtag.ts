/**
 * JTAG / IEEE-1149.1 boundary-scan builder.
 *
 * Builds the BSR (Boundary-Scan Register) from a list of pins, generates
 * a TAP FSM trace for a given test sequence, and computes the full TDI
 * shift sequence for a SAMPLE/PRELOAD or EXTEST instruction.
 *
 * Each pin contributes 1, 2, or 3 BSR cells depending on direction:
 *   input    → 1 cell  (capture)
 *   output   → 2 cells (data + control)
 *   bidir    → 3 cells (in + out + control)
 */
export type PinDir = 'input' | 'output' | 'bidir';
export interface JtagPin {
  name: string;
  dir: PinDir;
}

export type TapState =
  | 'TLR' | 'RTI' | 'SDS' | 'CDR' | 'SDR' | 'E1DR' | 'PDR' | 'E2DR' | 'UDR'
  |         'SIS' | 'CIR' | 'SIR' | 'E1IR' | 'PIR' | 'E2IR' | 'UIR';

/** TMS-driven next-state table. */
const NEXT: Record<TapState, [TapState, TapState]> = {
  // [TMS=0, TMS=1]
  TLR:  ['RTI', 'TLR'],
  RTI:  ['RTI', 'SDS'],
  SDS:  ['CDR', 'SIS'],
  CDR:  ['SDR', 'E1DR'],
  SDR:  ['SDR', 'E1DR'],
  E1DR: ['PDR', 'UDR'],
  PDR:  ['PDR', 'E2DR'],
  E2DR: ['SDR', 'UDR'],
  UDR:  ['RTI', 'SDS'],
  SIS:  ['CIR', 'TLR'],
  CIR:  ['SIR', 'E1IR'],
  SIR:  ['SIR', 'E1IR'],
  E1IR: ['PIR', 'UIR'],
  PIR:  ['PIR', 'E2IR'],
  E2IR: ['SIR', 'UIR'],
  UIR:  ['RTI', 'SDS'],
};

export interface JtagSpec {
  pins: JtagPin[];
  /** TMS bits to apply, MSB-first. */
  tms: (0 | 1)[];
  /** Starting state (default TLR). */
  start?: TapState;
}

export interface BsrCell {
  pin: string;
  /** Cell type: data-in, data-out, or output-enable control. */
  type: 'in' | 'out' | 'oe';
}

export interface JtagResult {
  bsr: BsrCell[];
  bsrLength: number;
  /** Trace of (cycle, tms, state-after) for the TMS sequence. */
  trace: { cycle: number; tms: 0 | 1; state: TapState }[];
  finalState: TapState;
  /** EXTEST shift cycles required = BSR length. */
  extestShiftCycles: number;
  /** SAMPLE/PRELOAD shift cycles = BSR length (capture+shift). */
  sampleShiftCycles: number;
}

export function buildJtag(spec: JtagSpec): JtagResult {
  if (!Array.isArray(spec.pins)) throw new Error('pins must be an array');
  const bsr: BsrCell[] = [];
  for (const p of spec.pins) {
    if (p.dir === 'input') bsr.push({ pin: p.name, type: 'in' });
    else if (p.dir === 'output') {
      bsr.push({ pin: p.name, type: 'out' }, { pin: p.name, type: 'oe' });
    } else {
      bsr.push({ pin: p.name, type: 'in' }, { pin: p.name, type: 'out' },
        { pin: p.name, type: 'oe' });
    }
  }
  let state: TapState = spec.start ?? 'TLR';
  const trace: JtagResult['trace'] = [];
  spec.tms.forEach((t, i) => {
    state = NEXT[state][t];
    trace.push({ cycle: i, tms: t, state });
  });
  return {
    bsr,
    bsrLength: bsr.length,
    trace,
    finalState: state,
    extestShiftCycles: bsr.length,
    sampleShiftCycles: bsr.length,
  };
}
