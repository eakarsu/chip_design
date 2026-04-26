/**
 * Microstrip / CPW characteristic-impedance calculator.
 *
 * Microstrip: line of width W on a dielectric of thickness H, εr.
 * Hammerstad-Jensen closed form (Pozar §3.8):
 *   εeff = (εr+1)/2 + (εr−1)/2 · (1 + 12 H/W)^(−0.5)
 *   if W/H < 1:
 *     Z0 = 60/√εeff · ln(8H/W + W/(4H))
 *   else:
 *     Z0 = 120π / [√εeff · (W/H + 1.393 + 0.667·ln(W/H + 1.444))]
 *
 * CPW (coplanar waveguide) with signal width W and gap S over thick
 * dielectric:
 *   k = W/(W+2S),  k' = sqrt(1−k²)
 *   K(k)/K(k') ratio approximated via:
 *     R(k) = (1/π)·ln(2·(1+√k')/(1−√k'))   for k ≤ 0.7
 *     R(k) = π/ln(2·(1+√k)/(1−√k))         for k > 0.7
 *   Z0 = 30π / (√εeff · R(k)),  εeff ≈ (εr+1)/2 (thick substrate).
 */
export type LineKind = 'microstrip' | 'cpw';

export interface MicrostripSpec {
  kind: LineKind;
  /** Conductor width W (μm). */
  wUm: number;
  /** Substrate height H (μm) for microstrip; ignored for CPW. */
  hUm: number;
  /** Gap S (μm) for CPW; ignored for microstrip. */
  sUm: number;
  /** Relative permittivity εr. */
  er: number;
  /** Frequency (GHz) — used only for skin-depth/loss flag. */
  fGhz?: number;
}

export interface LineResult {
  /** Characteristic impedance (Ω). */
  z0: number;
  /** Effective permittivity. */
  eEff: number;
  /** Phase velocity m/s. */
  vp: number;
  /** Wavelength at freq (mm), 0 if no freq. */
  lambdaMm: number;
  notes: string[];
}

const C = 2.998e8;

export function calcLine(spec: MicrostripSpec): LineResult {
  if (spec.wUm <= 0 || spec.er <= 1) throw new Error('W>0, er>1 required');
  let z0 = 0, eEff = 1;
  const notes: string[] = [];
  if (spec.kind === 'microstrip') {
    if (spec.hUm <= 0) throw new Error('hUm > 0 required for microstrip');
    const u = spec.wUm / spec.hUm;
    eEff = (spec.er + 1) / 2 + (spec.er - 1) / 2 *
      Math.pow(1 + 12 / u, -0.5);
    if (u < 1) {
      z0 = 60 / Math.sqrt(eEff) * Math.log(8 / u + u / 4);
    } else {
      z0 = 120 * Math.PI / (
        Math.sqrt(eEff) *
        (u + 1.393 + 0.667 * Math.log(u + 1.444))
      );
    }
  } else {
    if (spec.sUm <= 0) throw new Error('sUm > 0 required for CPW');
    const k = spec.wUm / (spec.wUm + 2 * spec.sUm);
    const kp = Math.sqrt(1 - k * k);
    let R: number;
    if (k <= 0.7) {
      R = (1 / Math.PI) * Math.log(2 * (1 + Math.sqrt(kp)) / (1 - Math.sqrt(kp)));
    } else {
      R = Math.PI / Math.log(2 * (1 + Math.sqrt(k)) / (1 - Math.sqrt(k)));
    }
    eEff = (spec.er + 1) / 2;
    z0 = 30 * Math.PI / (Math.sqrt(eEff) * R);
  }
  const vp = C / Math.sqrt(eEff);
  const lambdaMm = spec.fGhz && spec.fGhz > 0
    ? (vp / (spec.fGhz * 1e9)) * 1e3 : 0;
  if (z0 < 20)  notes.push('Z0 < 20 Ω — extremely wide trace');
  if (z0 > 120) notes.push('Z0 > 120 Ω — very narrow / lossy');
  return { z0, eEff, vp, lambdaMm, notes };
}
