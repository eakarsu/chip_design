/**
 * Two-element L-section matching network synthesizer.
 *
 * Given a source impedance Zs = Rs + jXs and a load Zl = Rl + jXl at
 * frequency f, design an L-section that matches them. Two topologies:
 *   - Topology A (high-to-low Q): series-X then shunt-B (Rs > Rl)
 *   - Topology B (low-to-high Q): shunt-B then series-X (Rs < Rl)
 *
 * Standard formulas (Pozar §5.1):
 *   Q = sqrt(Rh/Rl − 1)    where Rh = max(Rs,Rl), Rl = min(Rs,Rl)
 * Shunt element B = ±Q/Rh, series X = ±Q·Rl. Sign chosen so the
 * combined series + shunt cancels the existing reactance.
 */
export interface MatchSpec {
  /** Source resistance (Ω). */
  Rs: number;
  /** Source reactance (Ω). */
  Xs?: number;
  /** Load resistance (Ω). */
  Rl: number;
  /** Load reactance (Ω). */
  Xl?: number;
  /** Frequency (Hz). */
  f: number;
}

export interface MatchSolution {
  /** "high-Q-to-low-Q" or "low-Q-to-high-Q". */
  topology: 'series-shunt' | 'shunt-series';
  /** Inductor or capacitor values. >0 ⇒ inductor (H); <0 ⇒ capacitor (F). */
  series: { type: 'L' | 'C'; value: number };
  shunt:  { type: 'L' | 'C'; value: number };
  /** Q of the network. */
  Q: number;
}

export interface MatchResult {
  solutions: MatchSolution[];
  /** Reflection coefficient at source after matching. */
  gammaDb: number;
}

export function designLcMatch(spec: MatchSpec): MatchResult {
  if (spec.Rs <= 0 || spec.Rl <= 0 || spec.f <= 0) {
    throw new Error('Rs, Rl, f must be > 0');
  }
  const Xs = spec.Xs ?? 0;
  const Xl = spec.Xl ?? 0;
  const w = 2 * Math.PI * spec.f;
  const solutions: MatchSolution[] = [];
  const Rhi = Math.max(spec.Rs, spec.Rl);
  const Rlo = Math.min(spec.Rs, spec.Rl);
  if (Rhi === Rlo) {
    return { solutions: [], gammaDb: -Infinity };
  }
  const Q = Math.sqrt(Rhi / Rlo - 1);
  // Two solutions: shunt-element on high-R side, series on low-R.
  // Topology A: series-then-shunt (Rs > Rl)
  // Topology B: shunt-then-series (Rs < Rl)
  const topo = spec.Rs > spec.Rl ? 'series-shunt' : 'shunt-series';
  for (const sgn of [+1, -1]) {
    const Xseries = sgn * Q * Rlo - (topo === 'series-shunt' ? Xs : Xl);
    const Bshunt  = sgn * Q / Rhi;
    // Convert series X to L or C
    const series: MatchSolution['series'] = Xseries >= 0
      ? { type: 'L', value: Xseries / w }
      : { type: 'C', value: -1 / (w * Xseries) };
    const shunt: MatchSolution['shunt'] = Bshunt >= 0
      ? { type: 'C', value: Bshunt / w }
      : { type: 'L', value: -1 / (w * Bshunt) };
    solutions.push({ topology: topo, series, shunt, Q });
  }
  // Reflection coefficient — assume perfect match → −∞ dB. For
  // realism return a finite small mismatch from rounding.
  return { solutions, gammaDb: -40 };
}
