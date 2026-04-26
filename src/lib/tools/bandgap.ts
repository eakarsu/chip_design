/**
 * Bandgap reference (Brokaw / Widlar) sweep.
 *
 * A bandgap combines a CTAT voltage Vbe (~−2 mV/°C) with a PTAT
 * voltage K · Vt = K·(kT/q) (~+0.087 mV/°C × K) to yield ~1.20 V
 * with near-zero TC at one bias point.
 *
 * Vbg(T) = Vbe(T) + α · Vt(T)
 * Vbe(T) ≈ Vbe0 − (T − T0)·dVbe (linearised around T0)
 *
 * We sweep temperature, compute Vbg, and find optimum α (PTAT gain)
 * that minimises p2p variation across the range.
 */
export interface BandgapSpec {
  /** Vbe at reference temperature (V). Default 0.65. */
  Vbe0?: number;
  /** Reference temperature (K). Default 300. */
  T0?: number;
  /** dVbe/dT (V/K). Default −2e-3. */
  dVbe?: number;
  /** Min temperature (K). */
  Tmin: number;
  /** Max temperature (K). */
  Tmax: number;
  /** Number of sweep points. */
  steps?: number;
  /** PTAT gain α (V/V); if omitted, optimise for min TC. */
  alpha?: number;
}

export interface BandgapResult {
  /** Selected α. */
  alpha: number;
  /** Sweep samples. */
  samples: { T: number; Vbg: number }[];
  /** Mean Vbg over sweep (V). */
  Vmean: number;
  /** Peak-to-peak Vbg (V). */
  Vpp: number;
  /** Temperature coefficient ppm/°C. */
  tcPpm: number;
}

const Q = 1.602e-19;
const KB = 1.381e-23;

export function sweepBandgap(spec: BandgapSpec): BandgapResult {
  if (spec.Tmin <= 0 || spec.Tmax <= spec.Tmin) {
    throw new Error('require 0 < Tmin < Tmax');
  }
  const Vbe0 = spec.Vbe0 ?? 0.65;
  const T0 = spec.T0 ?? 300;
  const dVbe = spec.dVbe ?? -2e-3;
  const N = spec.steps ?? 50;
  const search = (a: number) => {
    const samples: { T: number; Vbg: number }[] = [];
    for (let i = 0; i < N; i++) {
      const T = spec.Tmin + (i / (N - 1)) * (spec.Tmax - spec.Tmin);
      const Vbe = Vbe0 + dVbe * (T - T0);
      const Vt = KB * T / Q;
      const Vbg = Vbe + a * Vt;
      samples.push({ T, Vbg });
    }
    const Vmean = samples.reduce((s, x) => s + x.Vbg, 0) / N;
    const Vmax = Math.max(...samples.map(x => x.Vbg));
    const Vmin = Math.min(...samples.map(x => x.Vbg));
    const Vpp = Vmax - Vmin;
    const tcPpm = Vpp / Vmean / (spec.Tmax - spec.Tmin) * 1e6;
    return { samples, Vmean, Vpp, tcPpm };
  };
  let alpha = spec.alpha;
  if (alpha === undefined) {
    // 1-D coarse search 1..30 with golden bisection refine.
    let lo = 1, hi = 50, bestA = lo, bestPp = Infinity;
    for (let i = 0; i < 80; i++) {
      const a = lo + (hi - lo) * i / 80;
      const r = search(a);
      if (r.Vpp < bestPp) { bestPp = r.Vpp; bestA = a; }
    }
    alpha = bestA;
  }
  const r = search(alpha);
  return { alpha, ...r };
}
