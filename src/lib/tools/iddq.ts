/**
 * IDDQ (quiescent-current) test planner.
 *
 * Given per-vector measured Iddq currents (μA) we cluster them into
 * "good" and "fail" buckets using a simple threshold strategy. The
 * threshold is set as `mean + k·stdev` over a baseline window of the
 * lowest-current vectors (assumed-fault-free reference). Any vector
 * exceeding the threshold is flagged.
 *
 * We also compute coverage as fraction of vectors above 1.5× baseline
 * mean — a heuristic proxy for "useful test power".
 */
export interface IddqVector {
  name: string;
  /** Quiescent current (μA). */
  iddqUa: number;
}

export interface IddqSpec {
  vectors: IddqVector[];
  /** Number of lowest vectors used to estimate baseline. */
  baselineN?: number;
  /** k in (mean + k·σ) threshold. */
  k?: number;
}

export interface IddqReport {
  name: string;
  iddqUa: number;
  bucket: 'pass' | 'marginal' | 'fail';
}

export interface IddqResult {
  reports: IddqReport[];
  baselineMean: number;
  baselineStd: number;
  threshold: number;
  failing: number;
  marginal: number;
  /** Fraction of vectors exceeding 1.5× baseline mean. */
  coverage: number;
}

export function planIddq(spec: IddqSpec): IddqResult {
  if (!spec.vectors.length) throw new Error('no vectors');
  const baselineN = Math.max(1, Math.min(
    spec.baselineN ?? Math.ceil(spec.vectors.length * 0.3),
    spec.vectors.length,
  ));
  const k = spec.k ?? 4;
  const sorted = [...spec.vectors].sort((a, b) => a.iddqUa - b.iddqUa);
  const base = sorted.slice(0, baselineN).map(v => v.iddqUa);
  const mean = base.reduce((a, b) => a + b, 0) / base.length;
  const variance = base.reduce((a, b) => a + (b - mean) ** 2, 0) / base.length;
  const std = Math.sqrt(variance);
  const threshold = mean + k * std;
  const margin = mean + Math.max(1, k - 2) * std;
  let failing = 0, marginalCnt = 0, useful = 0;
  const reports: IddqReport[] = spec.vectors.map(v => {
    let bucket: IddqReport['bucket'] = 'pass';
    if (v.iddqUa > threshold) { bucket = 'fail'; failing++; }
    else if (v.iddqUa > margin) { bucket = 'marginal'; marginalCnt++; }
    if (v.iddqUa > 1.5 * mean) useful++;
    return { name: v.name, iddqUa: v.iddqUa, bucket };
  });
  return {
    reports,
    baselineMean: mean,
    baselineStd: std,
    threshold,
    failing,
    marginal: marginalCnt,
    coverage: useful / spec.vectors.length,
  };
}
