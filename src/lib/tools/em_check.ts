/**
 * Electromigration (EM) checker for power-strap segments.
 *
 * Black's equation gives mean time to failure for a metal segment as
 * MTTF ∝ J^-n · exp(Ea/kT). For sign-off we instead compare the
 * computed current density J = I / (W·T) against a per-layer maximum
 * Jmax. Anything over Jmax fails; over 0.8·Jmax is a warning.
 *
 * Inputs are in microns / amperes. Layer Jmax is given in MA/cm² and we
 * convert internally. We don't reason about thermal coupling — that's
 * what the IR-drop tool is for; here we just flag dangerously thin
 * straps.
 */
export interface EmSegment {
  name: string;
  layer: string;
  /** Strap width (μm). */
  width: number;
  /** Strap length (μm) — only used to report total stressed wire. */
  length: number;
  /** Steady-state current carried (A). Use absolute value. */
  current: number;
}

export interface EmLayerSpec {
  /** Layer name. */
  name: string;
  /** Metal thickness (μm). */
  thickness: number;
  /** Maximum allowable current density (MA/cm² = mA/μm²). */
  jmax: number;
}

export interface EmReport {
  name: string;
  layer: string;
  /** A / μm². */
  J: number;
  /** Ratio J / Jmax. */
  ratio: number;
  status: 'ok' | 'warn' | 'fail';
}

export interface EmResult {
  reports: EmReport[];
  failing: number;
  warning: number;
  totalLength: number;
  warnings: string[];
}

export function checkEM(
  segments: EmSegment[], layers: EmLayerSpec[],
): EmResult {
  if (!Array.isArray(segments)) throw new Error('segments must be an array');
  if (!Array.isArray(layers))   throw new Error('layers must be an array');
  const byLayer = new Map(layers.map(l => [l.name, l]));
  const reports: EmReport[] = [];
  const warnings: string[] = [];
  let failing = 0, warn = 0, totalLen = 0;
  for (const s of segments) {
    const layer = byLayer.get(s.layer);
    if (!layer) {
      warnings.push(`segment ${s.name}: unknown layer ${s.layer}`);
      continue;
    }
    if (s.width <= 0 || layer.thickness <= 0) {
      warnings.push(`segment ${s.name}: non-positive geometry`);
      continue;
    }
    // J = I / (w·t), units A / μm². Jmax is given in mA/μm² (= MA/cm²).
    const J = Math.abs(s.current) / (s.width * layer.thickness);
    const Jmax = layer.jmax * 1e-3;     // → A/μm²
    const ratio = J / Jmax;
    let status: EmReport['status'] = 'ok';
    if (ratio >= 1) { status = 'fail'; failing++; }
    else if (ratio >= 0.8) { status = 'warn'; warn++; }
    reports.push({ name: s.name, layer: s.layer, J, ratio, status });
    totalLen += s.length;
  }
  return { reports, failing, warning: warn, totalLength: totalLen, warnings };
}
