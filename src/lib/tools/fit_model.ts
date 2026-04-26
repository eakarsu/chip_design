/**
 * FIT (Failures in Time) lifetime predictor.
 *
 * 1 FIT = 1 failure per 10⁹ device-hours. We sum independent
 * mechanism contributions:
 *
 *   FIT_total = Σ (devices_i · base_FIT_i · accel_i)
 *
 * with Arrhenius temperature acceleration accel = exp(Ea/k · (1/Tu - 1/T))
 * relative to the use-temperature Tu.
 *
 * Mechanisms supported: NBTI, HCI, TDDB, EM, soft-error (no temp accel).
 */
export interface FitMechanism {
  name: string;
  /** Number of devices stressed. */
  population: number;
  /** Base FIT per device at use-temperature. */
  baseFit: number;
  /** Activation energy (eV). 0 disables temperature acceleration. */
  Ea: number;
}

export interface FitSpec {
  mechanisms: FitMechanism[];
  /** Use temperature (K). */
  useK: number;
  /** Stress temperature (K) — what `baseFit` was characterised at. */
  stressK: number;
}

export interface FitContribution {
  name: string;
  fit: number;
  fraction: number;
  mttfHours: number;
}

export interface FitResult {
  contributions: FitContribution[];
  totalFit: number;
  /** Mean time to failure (hours). */
  mttfHours: number;
  /** MTTF in years. */
  mttfYears: number;
}

const k = 8.617333e-5; // eV/K

export function computeFIT(spec: FitSpec): FitResult {
  if (spec.useK <= 0 || spec.stressK <= 0) {
    throw new Error('temperatures must be positive Kelvin');
  }
  const contributions: FitContribution[] = [];
  let total = 0;
  for (const m of spec.mechanisms) {
    if (m.population < 0) throw new Error(`negative population for ${m.name}`);
    // Arrhenius: AF(stress→use) = exp(Ea/k · (1/Tstress − 1/Tuse)).
    // Cooler use temperature → AF < 1 → lower FIT.
    const accel = m.Ea > 0
      ? Math.exp(m.Ea / k * (1 / spec.stressK - 1 / spec.useK))
      : 1;
    const fit = m.population * m.baseFit * accel;
    total += fit;
    contributions.push({
      name: m.name, fit, fraction: 0,
      mttfHours: fit > 0 ? 1e9 / fit : Infinity,
    });
  }
  for (const c of contributions) {
    c.fraction = total > 0 ? c.fit / total : 0;
  }
  const mttfHours = total > 0 ? 1e9 / total : Infinity;
  return {
    contributions, totalFit: total,
    mttfHours, mttfYears: mttfHours / 8760,
  };
}
