/**
 * On-chip spiral inductor Q estimator.
 *
 * Modified Wheeler / current-sheet approximation for octagonal /
 * square integrated spirals (Mohan et al., JSSC 1999). Inputs:
 *   - outer dim Dout (μm), inner dim Din (μm)
 *   - turns N, line width W (μm), spacing S (μm)
 *   - sheet resistance Rs (Ω/sq), substrate freq fself (GHz) limit
 *
 * L (nH) ≈ K1·μ0·N²·davg / (1 + K2·ρ)  (Wheeler form)
 *   davg = (Dout + Din)/2,  ρ = (Dout − Din)/(Dout + Din)
 * Series R at frequency f via skin-depth + sheet:
 *   R_DC = Rs · ℓ / W
 *   R(f) = R_DC · (1 + (f/fSkin)²)^0.25
 * Q(f) = ωL / R(f) below self-resonance fself.
 */
export interface SpiralSpec {
  /** Outer dimension (μm). */
  doutUm: number;
  /** Inner dimension (μm). */
  dinUm: number;
  /** Number of turns. */
  N: number;
  /** Line width (μm). */
  wUm: number;
  /** Line spacing (μm). */
  sUm: number;
  /** Sheet resistance Ω/sq. */
  rsOhmSq: number;
  /** Self-resonant frequency (GHz). */
  fselfGhz?: number;
  /** Frequency for Q calc (GHz). */
  fGhz: number;
}

export interface SpiralResult {
  /** Inductance (nH). */
  L_nH: number;
  /** Series resistance (Ω). */
  R_ohm: number;
  /** Quality factor at fGhz. */
  Q: number;
  /** Approx wire length (μm). */
  lengthUm: number;
  /** Self-resonance limit hit? */
  pastSelfResonance: boolean;
  notes: string[];
}

export function estimateSpiralQ(spec: SpiralSpec): SpiralResult {
  if (spec.doutUm <= spec.dinUm) throw new Error('Dout must be > Din');
  if (spec.N < 1) throw new Error('N must be >= 1');
  if (spec.wUm <= 0 || spec.fGhz <= 0) throw new Error('positive widths/freq required');
  // Modified Wheeler for square spiral (K1=2.34, K2=2.75)
  const davg = (spec.doutUm + spec.dinUm) / 2 * 1e-6;             // m
  const rho = (spec.doutUm - spec.dinUm) / (spec.doutUm + spec.dinUm);
  const mu0 = 4 * Math.PI * 1e-7;
  const L = (2.34 * mu0 * spec.N ** 2 * davg) / (1 + 2.75 * rho); // H
  const L_nH = L * 1e9;
  // Wire length: per turn ≈ 4·avg_side; total = N * perim
  const turnPerimUm = 4 * (spec.dinUm + spec.N * (spec.wUm + spec.sUm));
  const lengthUm = spec.N * turnPerimUm;
  // R at DC (sheet × squares)
  const R_DC = spec.rsOhmSq * lengthUm / spec.wUm;
  // Skin-effect knee at ~ 1 GHz for typical Cu/W stacks
  const fSkin = 1e9;
  const fHz = spec.fGhz * 1e9;
  const R_ac = R_DC * Math.pow(1 + (fHz / fSkin) ** 2, 0.25);
  const omega = 2 * Math.PI * fHz;
  let Q = omega * L / R_ac;
  const fself = spec.fselfGhz ?? 25;          // typical 25 GHz
  const past = spec.fGhz >= fself;
  if (past) Q *= Math.max(0, 1 - (spec.fGhz - fself) / fself);
  const notes: string[] = [];
  if (past) notes.push(`past self-resonance (${fself} GHz) — Q rolls off`);
  if (rho > 0.85) notes.push('hollow spiral — re-check Din');
  if (R_ac > omega * L / 3) notes.push('low-Q (resistive losses dominant)');
  return { L_nH, R_ohm: R_ac, Q, lengthUm, pastSelfResonance: past, notes };
}
