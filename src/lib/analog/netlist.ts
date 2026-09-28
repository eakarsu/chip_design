/**
 * SPICE deck generation for the buck converter.
 *
 * Both decks model the converter family in the catalog (peak-current-mode
 * control with an external inductor and output capacitor):
 *
 *  - transient: averaged current-mode plant with the Type-II compensator,
 *    startup and load-step response. Switching ripple is NOT represented here;
 *    the design module provides an analytic ripple estimate and labels it.
 *  - average-ac: averaged plant for loop gain, crossover and phase margin.
 *
 * The IC is modelled behaviourally (switch resistance/drop, gate charge and
 * error-amplifier gm from the curated catalog). Vendor SPICE models should be
 * substituted for sign-off; the deck records that limitation.
 */
import type { BuckDesign, Requirements } from './types';

export interface TransientDeckInput {
  requirements: Requirements;
  design: BuckDesign;
  /** Simulated time in seconds (default 3 ms). */
  tstop?: number;
  /** Maximum time step (default min(period/20, tstop/20000)). */
  tstep?: number;
  /** Load step start time (default 60% of tstop). */
  stepAt?: number;
}

export interface DeckResult {
  deck: string;
  tstep: number;
  tstop: number;
  stepAt: number;
  loadMaxOhm: number;
  loadMinOhm: number;
  notes: string[];
}

export function buildTransientDeck(input: TransientDeckInput): DeckResult {
  const { requirements, design } = input;
  const tstop = input.tstop ?? 3e-3;
  const tstep = input.tstep ?? Math.min(1 / design.fswHz / 20, tstop / 20_000);
  const stepAt = input.stepAt ?? tstop * 0.6;
  const loadMaxOhm = requirements.vout / Math.max(requirements.ioutMax, 1e-6);
  const loadMinOhm = requirements.ioutMin > 0 ? requirements.vout / requirements.ioutMin : 1e6;
  const dcrOhm = Number.parseFloat(design.billOfMaterials.find((item) => item.kind === 'inductor')?.keyParams.dcr ?? '0 mΩ') / 1000;
  const esr = Number.parseFloat(design.billOfMaterials.find((item) => item.kind === 'output-capacitor')?.keyParams.esr ?? '0 mΩ') / 1000;
  const gmps = requirements.ioutMax * 1.25;
  const notes = [
    'Averaged current-mode model: the compensator voltage commands inductor current (gmps = 1.25 · Iout,max per volt) and the IC clamps its output to the modulator range.',
    'Switching ripple is not represented by this model; the analytic ripple estimate from the design module is reported alongside.',
    'Output capacitor is modelled as effective capacitance after DC-bias derating, with the catalog ESR.',
  ];

  const deck = `* Buck converter average transient — NeuralChip Analog Power Design Studio
* IC: ${design.ic.part} (${design.ic.topology}); averaged peak-current-mode model
* Generated deck. Simulation output is evidence, not a guarantee.

.param l=${design.inductanceH}
.param dcr=${dcrOhm}
.param cout=${design.outputCapEffectiveF}
.param esr=${esr}
.param rload=${loadMaxOhm}
.param rloadmin=${loadMinOhm}
.param rc=${design.compensation.rcOhm}
.param cc=${design.compensation.ccF}
.param cp=${design.compensation.cpF ?? 1e-15}
.param gm=${(design.ic.errorAmpGmMicroSiemens ?? 1000) / 1e6}
.param r1=${design.feedbackR1Ohm}
.param r2=${design.feedbackR2Ohm}
.param gmps=${gmps}

Gps 0 lx ctrl 0 {gmps}
L1 lx lxn {l}
Rdcr lxn oc {dcr}
Cout oc cx {cout}
Resr cx 0 {esr}
Rload oc 0 {rload}
Bstep oc 0 I = (time > ${stepAt}) ? (v(oc)/${loadMinOhm} - v(oc)/${loadMaxOhm}) : 0

Rfb1 oc fb {r1}
Rfb2 fb 0 {r2}
Vref ref 0 PWL(0 0 1m ${design.ic.vrefV} ${tstop} ${design.ic.vrefV})

Gerr 0 err ref fb {gm}
Rc err nz {rc}
Cc nz 0 {cc}
Cp err 0 {cp}
Rleak err 0 10MEG
* The IC clamps the compensator output to the modulator range.
Bctrl ctrl 0 V = min(max(v(err), 0), 1)

.control
set wr_singlescale
set wr_vecnames
tran ${tstep} ${tstop}
wrdata deck-out.dat v(oc) v(ctrl) i(l1)
quit
.endc
.end
`;
  return { deck, tstep, tstop, stepAt, loadMaxOhm, loadMinOhm, notes };
}

export interface AverageAcDeckInput {
  requirements: Requirements;
  design: BuckDesign;
  fStart?: number;
  fStop?: number;
  pointsPerDecade?: number;
}

export function buildAverageAcDeck(input: AverageAcDeckInput): { deck: string; notes: string[] } {
  const { requirements, design } = input;
  const fStart = input.fStart ?? 10;
  const fStop = input.fStop ?? Math.min(design.fswHz * 2, 5e6);
  const points = input.pointsPerDecade ?? 50;
  const dcrOhm = Number.parseFloat(design.billOfMaterials.find((item) => item.kind === 'inductor')?.keyParams.dcr ?? '0 mΩ') / 1000;
  const esr = Number.parseFloat(design.billOfMaterials.find((item) => item.kind === 'output-capacitor')?.keyParams.esr ?? '0 mΩ') / 1000;
  const rload = requirements.vout / Math.max(requirements.ioutMax, 1e-6);
  const gmps = requirements.ioutMax * 1.25;
  const notes = [
    'Averaged peak-current-mode plant: the compensator voltage commands inductor current through gmps = 1.25 · Iout,max per volt.',
    'Loop gain is measured by injecting an AC source between the compensator output and the current command; T = 1/V(ctrl) − 1.',
    'Exact small-signal behaviour of the real IC depends on its internal model; treat crossover and phase margin as estimates.',
  ];
  const deck = `* Average AC loop-gain model — NeuralChip Analog Power Design Studio
* IC: ${design.ic.part}; averaged peak-current-mode plant

.param l=${design.inductanceH}
.param dcr=${dcrOhm}
.param cout=${design.outputCapEffectiveF}
.param esr=${esr}
.param rload=${rload}
.param rc=${design.compensation.rcOhm}
.param cc=${design.compensation.ccF}
.param cp=${design.compensation.cpF ?? 1e-15}
.param gm=${(design.ic.errorAmpGmMicroSiemens ?? 1000) / 1e6}
.param r1=${design.feedbackR1Ohm}
.param r2=${design.feedbackR2Ohm}
.param gmps=${gmps}

Gps 0 lx ctrl 0 {gmps}
L1 lx lxn {l}
Rdcr lxn oc {dcr}
Cout oc cx {cout}
Resr cx 0 {esr}
Rload oc 0 {rload}

Rfb1 oc fb {r1}
Rfb2 fb 0 {r2}
Vref ref 0 dc ${design.ic.vrefV}

Gerr 0 err ref fb {gm}
Rc err nz {rc}
Cc nz 0 {cc}
Cp err 0 {cp}
Rleak err 0 10MEG

Vinj ctrl err AC 1

.control
set wr_singlescale
set wr_vecnames
ac dec ${points} ${fStart} ${fStop}
wrdata deck-ac.dat v(ctrl)
quit
.endc
.end
`;
  return { deck, notes };
}
