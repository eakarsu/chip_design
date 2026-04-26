/**
 * LDO PSRR (power-supply rejection ratio) estimator.
 *
 * For a series-pass LDO with feedback factor β = R2/(R1+R2) and
 * loop-gain T(s) = A(s)·β, the PSRR (in dB, larger ⇒ better) is
 *   PSRR(s) = 20 log10 |1 + T(s)|         (negative-feedback regulator)
 * The error amplifier has open-loop gain A0 with dominant pole p1 and
 * a zero from the output capacitor's ESR.
 *
 * We compute PSRR vs. frequency and report bandwidth at which PSRR
 * drops below a target (e.g., 60 dB).
 */
export interface LdoSpec {
  /** Open-loop DC gain of error amp (V/V). */
  A0: number;
  /** Dominant-pole frequency (Hz). */
  fp1: number;
  /** Output capacitor ESR (Ω). */
  esr: number;
  /** Output capacitance (F). */
  cout: number;
  /** Feedback divider ratio β = Vfb/Vout. */
  beta: number;
  /** Pass-device transconductance gmp (S). */
  gmp: number;
  /** Load current (A). */
  iload: number;
  /** PSRR target floor (dB). Default 60. */
  targetDb?: number;
}

export interface LdoResult {
  /** PSRR at DC (dB). */
  dcDb: number;
  /** ESR-zero frequency (Hz). */
  fEsrZero: number;
  /** Frequency at which PSRR drops to targetDb (Hz). */
  fAtTarget: number;
  /** Sample points {f, psrrDb}. */
  samples: { f: number; psrrDb: number }[];
}

export function estimateLdoPsrr(spec: LdoSpec): LdoResult {
  if (spec.A0 <= 0) throw new Error('A0 must be > 0');
  if (spec.fp1 <= 0) throw new Error('fp1 must be > 0');
  if (spec.cout <= 0) throw new Error('cout must be > 0');
  const target = spec.targetDb ?? 60;
  const fEsrZero = 1 / (2 * Math.PI * spec.esr * spec.cout);
  const samples: { f: number; psrrDb: number }[] = [];
  let fAtTarget = -1;
  // 4 decades from 10 Hz to 100 MHz (40 points)
  for (let k = 0; k <= 40; k++) {
    const f = 10 * Math.pow(10, k * 7 / 40);          // 10..1e8
    const w = 2 * Math.PI * f;
    // |A(jω)| ≈ A0 / sqrt(1 + (ω/ωp)²)
    const wp1 = 2 * Math.PI * spec.fp1;
    const Amag = spec.A0 / Math.sqrt(1 + (w / wp1) ** 2);
    // Output node impedance with cap+ESR: Zout(jω) = ESR + 1/(jωC)
    const zoutMag = Math.sqrt(spec.esr ** 2 + (1 / (w * spec.cout)) ** 2);
    // Loop gain T = A·β·gmp·Zout (rough)
    const T = Amag * spec.beta * spec.gmp * zoutMag;
    // PSRR ≈ 20 log10 (1 + T)
    const psrrDb = 20 * Math.log10(1 + T);
    samples.push({ f, psrrDb });
    if (fAtTarget < 0 && psrrDb < target) fAtTarget = f;
  }
  if (fAtTarget < 0) fAtTarget = samples[samples.length - 1].f;
  // DC PSRR ≈ first low-frequency sample (10 Hz acts as DC proxy).
  const dcDb = samples[0].psrrDb;
  return {
    dcDb,
    fEsrZero,
    fAtTarget,
    samples,
  };
}
