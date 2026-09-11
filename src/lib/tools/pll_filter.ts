/**
 * PLL loop-filter calculator (charge-pump 3rd-order).
 *
 * For a Type-II charge-pump PLL with an LC-VCO or ring-VCO, the
 * passive loop filter is C1 ‖ (R2 + C2). Given:
 *   - reference frequency fref
 *   - desired loop bandwidth fc (typically fref/10)
 *   - phase margin PM
 *   - VCO gain Kvco (Hz/V)
 *   - charge-pump current Icp (A)
 *   - divide ratio N
 * we solve for R2, C1, C2.
 *
 * Standard formulas (Razavi, "Design of CMOS PLLs"):
 *   ωc = 2π fc
 *   Z(s) = (1 + s·R·C2) / (s·(C1+C2)·(1 + s·R·C1·C2/(C1+C2)))
 *   zero ωz = 1/(R·C2), pole ωp = (C1+C2)/(R·C1·C2)
 * Place the zero/pole symmetrically about ωc: ωz = ωc/√b, ωp = ωc·√b,
 * with b = (C1+C2)/C1. Then tan(PM) = (b−1)/(2√b), so
 *   b = (1 + sin PM) / (1 − sin PM)
 * Unity loop gain |Icp·Kvco_rad·Z(jωc)/(N·ωc)| = 1 gives
 *   R = N·ωc·b / (2π·Kvco·Icp)
 * and the components follow from R·C2 = √b/ωc and C1 = C2/(b−1).
 */
export interface PllSpec {
  /** Reference frequency (Hz). */
  fref: number;
  /** VCO output frequency (Hz). */
  fvco: number;
  /** Loop bandwidth (Hz). */
  fc: number;
  /** Desired phase margin (degrees). */
  pmDeg: number;
  /** VCO gain Kvco (Hz/V). */
  kvco: number;
  /** Charge-pump current Icp (A). */
  icp: number;
}

export interface PllResult {
  /** Divide ratio N = fvco / fref. */
  N: number;
  /** Loop filter resistor R (Ω). */
  R: number;
  /** Pole-removal cap C1 (F). */
  C1: number;
  /** Series cap C2 (F). */
  C2: number;
  /** Zero/pole ratio b (= (C1+C2)/C1). */
  b: number;
  /** Achieved phase margin (deg). */
  pmActualDeg: number;
  notes: string[];
}

export function calcPllFilter(spec: PllSpec): PllResult {
  if (spec.fref <= 0 || spec.fvco <= 0 || spec.fc <= 0) {
    throw new Error('frequencies must be > 0');
  }
  if (spec.pmDeg < 30 || spec.pmDeg > 80) {
    throw new Error('phase margin should be 30°-80°');
  }
  const N = spec.fvco / spec.fref;
  const wc = 2 * Math.PI * spec.fc;
  const pm = spec.pmDeg * Math.PI / 180;
  // Zero/pole spacing for the target PM, from tan(PM) = (b − 1)/(2√b).
  const b = (1 + Math.sin(pm)) / (1 - Math.sin(pm));
  // Unity loop gain at ωc for the symmetric zero/pole placement.
  const R = (N * wc * b) / (2 * Math.PI * spec.kvco * spec.icp);
  // R·C2 sets the zero at ωc/√b; C1 follows from b = (C1+C2)/C1.
  const C2 = Math.sqrt(b) / (wc * R);
  const C1 = C2 / (b - 1);
  // Recompute PM from the actual zero/pole of C1 ‖ (R + C2).
  const wzero = 1 / (R * C2);
  const wpole = (C1 + C2) / (R * C1 * C2);
  const pmActual = Math.atan(wc / wzero) - Math.atan(wc / wpole);
  const notes: string[] = [];
  if (spec.fc > spec.fref / 10) {
    notes.push('loop bandwidth > fref/10 — continuous-time approximation breaks down');
  }
  if (R > 100e3) notes.push('R > 100 kΩ — sensitive to flicker/IR drop');
  if (C2 < 1e-12) notes.push('C2 < 1 pF — parasitic-dominated');
  return {
    N, R, C1, C2, b, pmActualDeg: pmActual * 180 / Math.PI, notes,
  };
}
