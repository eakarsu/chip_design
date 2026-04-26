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
 *   tan(PM) = 1/(ωc R C2) − ωc R C1
 *   pick C2 = 10 · C1 (typical)
 * Use approximate closed form:
 *   R = 2π · PM_radian_factor / (ωc · K · Icp / N)
 *   C1 = 1 / (ωc · R · b)
 * Implementation uses: Icp · Kvco / N = ωc² · C / (b - 1) where b is
 * the zero/pole ratio derived from PM.
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
  // b = (1 + sec(PM)) / 2 picks zero/pole spacing for target PM
  const b = (1 + 1 / Math.cos(pm)) / 2;
  // R · Icp · Kvco / N = ωc · sqrt(b) → R = ωc·sqrt(b)·N/(Icp·Kvco)
  const R = (wc * Math.sqrt(b) * N) / (spec.icp * spec.kvco);
  // C1 chosen so zero is at ωc/√b, pole at ωc·√b
  const C1 = Math.sqrt(b) / (wc * R);
  const C2 = (b - 1) * C1;
  // Recompute PM as sanity check.
  const wzero = 1 / (R * (C1 + C2));
  const wpole = 1 / (R * (C1 * C2 / (C1 + C2)));
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
