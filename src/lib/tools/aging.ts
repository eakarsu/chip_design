/**
 * NBTI / BTI threshold-voltage drift projection.
 *
 * Reaction-diffusion model used by industry sign-off:
 *
 *   ΔVth(t) = A · α · exp(γ·Vgs) · exp(−Ea/kT) · t^n
 *
 * α is the duty cycle (fraction of time the device is biased "on"),
 * t is time in seconds, n ≈ 1/6 for NBTI, A and γ are technology
 * constants, and Ea is the Arrhenius activation energy. We
 * parameterise with a few PDK-level knobs and let the caller sweep
 * activity / years.
 */
export interface AgingSpec {
  /** Per-device activity α (0..1). */
  alpha: number;
  /** Operating Vgs (V). */
  vgs: number;
  /** Junction temperature (K). */
  tempK: number;
  /** Operating life target (years). */
  years: number;
  /** Empirical pre-factor A (V·s^-n). Default 5e-4. */
  A?: number;
  /** Field acceleration γ (1/V). Default 0.5. */
  gamma?: number;
  /** Arrhenius activation energy Ea (eV). Default 0.1. */
  Ea?: number;
  /** Time exponent n. NBTI = 1/6, HCI ≈ 0.5. Default 1/6. */
  n?: number;
}

export interface AgingPoint {
  years: number;
  dVth: number;
}

export interface AgingResult {
  /** Final ΔVth (V). */
  dVth: number;
  /** Logarithmic-time samples for plotting. */
  samples: AgingPoint[];
  /** Equivalent fresh-die slack loss assuming 1 mV ΔVth ≈ 1 ps slack. */
  slackLossPs: number;
}

const k = 8.617333e-5; // eV/K

export function projectAging(spec: AgingSpec): AgingResult {
  if (spec.alpha < 0 || spec.alpha > 1) throw new Error('alpha must be in [0,1]');
  if (spec.tempK <= 0) throw new Error('tempK must be positive');
  if (spec.years <= 0) throw new Error('years must be positive');
  const A = spec.A ?? 5e-4;
  const gamma = spec.gamma ?? 0.5;
  const Ea = spec.Ea ?? 0.1;
  const n = spec.n ?? 1 / 6;
  // Field acceleration exp(γ·Vgs) times Arrhenius thermal acceleration
  // exp(−Ea/kT); both must feed the projected drift.
  const factor = A * Math.exp(gamma * spec.vgs) * Math.exp(-Ea / (k * spec.tempK));
  const dVth = factor * spec.alpha * Math.pow(Math.max(spec.years * 365 * 86400, 1), n);
  // Generate log samples.
  const samples: AgingPoint[] = [];
  const steps = 24;
  for (let i = 0; i <= steps; i++) {
    const yr = (spec.years * (i + 1)) / (steps + 1);
    const t = yr * 365 * 86400;
    samples.push({ years: yr, dVth: factor * spec.alpha * Math.pow(Math.max(t, 1), n) });
  }
  return { dVth, samples, slackLossPs: dVth * 1000 };
}
