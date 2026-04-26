/**
 * Smith-chart helper: convert between Z, Γ, VSWR and produce sample
 * arcs for plotting.
 *
 * Z normalised z = Z/Z0. Γ = (z−1)/(z+1).
 * VSWR = (1 + |Γ|) / (1 − |Γ|).
 *
 * Constant-R circle in Γ plane: centre (R/(R+1), 0), radius 1/(R+1).
 * Constant-X arc: centre (1, 1/X), radius 1/|X|.
 */
export interface SmithPoint {
  /** Frequency (Hz). */
  f: number;
  /** Real part of Z. */
  R: number;
  /** Imag part of Z. */
  X: number;
}

export interface SmithDerived extends SmithPoint {
  /** Γ as { re, im }. */
  gamma: { re: number; im: number };
  /** |Γ|. */
  gammaMag: number;
  /** Return loss (dB), positive value. */
  rlDb: number;
  /** VSWR. */
  vswr: number;
}

export interface SmithChartArcs {
  /** Constant-R circles: centre.x, centre.y, radius. */
  rCircles: { r: number; cx: number; cy: number; rad: number }[];
  /** Constant-X arcs (positive and negative reactance). */
  xArcs:    { x: number; cx: number; cy: number; rad: number }[];
}

export function gammaFromZ(R: number, X: number, Z0: number) {
  const zr = R / Z0, zi = X / Z0;
  // Γ = (z−1)/(z+1)
  const numR = zr - 1, numI = zi;
  const denR = zr + 1, denI = zi;
  const denMag = denR * denR + denI * denI;
  const gr = (numR * denR + numI * denI) / denMag;
  const gi = (numI * denR - numR * denI) / denMag;
  return { re: gr, im: gi };
}

export function smithDerive(pts: SmithPoint[], Z0 = 50): SmithDerived[] {
  return pts.map(p => {
    const g = gammaFromZ(p.R, p.X, Z0);
    const mag = Math.hypot(g.re, g.im);
    const rl  = mag > 0 ? -20 * Math.log10(mag) : Infinity;
    const vswr = mag >= 1 ? Infinity : (1 + mag) / (1 - mag);
    return { ...p, gamma: g, gammaMag: mag, rlDb: rl, vswr };
  });
}

export function smithArcs(): SmithChartArcs {
  const rCircles: SmithChartArcs['rCircles'] = [];
  for (const r of [0, 0.2, 0.5, 1, 2, 5]) {
    rCircles.push({
      r,
      cx: r / (r + 1),
      cy: 0,
      rad: 1 / (r + 1),
    });
  }
  const xArcs: SmithChartArcs['xArcs'] = [];
  for (const x of [0.2, 0.5, 1, 2, 5, -0.2, -0.5, -1, -2, -5]) {
    xArcs.push({
      x,
      cx: 1,
      cy: 1 / x,
      rad: 1 / Math.abs(x),
    });
  }
  return { rCircles, xArcs };
}
