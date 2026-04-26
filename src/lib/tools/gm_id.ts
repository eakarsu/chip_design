/**
 * Op-amp gm/Id sizing assistant.
 *
 * The gm/Id design methodology trades-off transconductance per current
 * against the inversion region. Strong inversion (low gm/Id) gives
 * speed; weak inversion (high gm/Id) gives efficiency. We use a smooth
 * EKV-like interpolation:
 *
 *   gm/Id(VOV) = 2 / (VOV + 2·n·Vt)         (≈)  for VOV ≥ 0
 *
 * where Vt = kT/q ≈ 25.85 mV at 300 K and n is the slope factor.
 *
 * Given a target gm and a power budget, we pick a gm/Id, derive Id =
 * gm / (gm/Id), and report W/L from a simple square-law: gm = sqrt(2 ·
 * μCox · W/L · Id).
 */
export interface GmIdSpec {
  /** Required transconductance (S). */
  gmTarget: number;
  /** Inversion region target: 'weak' | 'moderate' | 'strong'. */
  region: 'weak' | 'moderate' | 'strong';
  /** Process: μCox (A/V²). Typical 28 nm NMOS ≈ 250 μA/V². */
  uCox: number;
  /** Channel length (m). */
  L: number;
  /** Slope factor n (1.0–1.5). Default 1.2. */
  n?: number;
  /** Temperature (K). Default 300. */
  T?: number;
}

export interface GmIdResult {
  /** Selected gm/Id (1/V). */
  gmIdRatio: number;
  /** Required drain current (A). */
  Id: number;
  /** Effective overdrive VOV (V). */
  Vov: number;
  /** Width W in metres. */
  W: number;
  /** W/L ratio. */
  WL: number;
  /** Approximate intrinsic gain Av0 (gm·ro). */
  Av0: number;
  notes: string[];
}

const Q = 1.602e-19;
const KB = 1.381e-23;

export function sizeGmId(spec: GmIdSpec): GmIdResult {
  if (spec.gmTarget <= 0) throw new Error('gmTarget must be > 0');
  if (spec.uCox <= 0 || spec.L <= 0) throw new Error('uCox and L must be > 0');
  const n = spec.n ?? 1.2;
  const T = spec.T ?? 300;
  const Vt = KB * T / Q;

  // Fix gm/Id by region.
  const gmIdRatio = spec.region === 'weak' ? 25
    : spec.region === 'moderate' ? 15 : 8;
  const Vov = (2 / gmIdRatio) - 2 * n * Vt;
  const VovEff = Math.max(0.05, Vov);          // floor at 50 mV
  const Id = spec.gmTarget / gmIdRatio;
  // gm = sqrt(2·μCox·W/L·Id) → W/L = gm² / (2·μCox·Id)
  const WL = (spec.gmTarget ** 2) / (2 * spec.uCox * Id);
  const W = WL * spec.L;
  // Av0 ≈ gm · ro; ro ~ 1 / (λ·Id), λ ~ 0.05/L (μm) — use L-dependent λ:
  const lambda = 0.05 / (spec.L * 1e6);          // /V
  const ro = 1 / Math.max(1e-9, lambda * Id);
  const Av0 = spec.gmTarget * ro;
  const notes: string[] = [];
  if (Vov < 0.05) notes.push('weak inversion: VOV clipped to 50 mV');
  if (WL > 1e6) notes.push('extreme W/L — re-check L choice');
  if (Av0 < 100) notes.push('low intrinsic gain — consider cascode');
  return { gmIdRatio, Id, Vov: VovEff, W, WL, Av0, notes };
}
