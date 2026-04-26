/**
 * Slack-distribution analysis for STA timing paths.
 *
 * Given a list of `TimingPath` (from parseTimingPaths) — or a flat array of
 * slack numbers — produce a histogram suitable for rendering as a bar chart,
 * plus the standard timing-summary scalars (WNS, TNS, counts).
 *
 * Bins are linear in the slack axis. We classify each bin into one of three
 * health bands so the UI can colour them without recomputing thresholds:
 *
 *   - violation: slack ≤ 0
 *   - critical:  0 < slack ≤ criticalMargin (default 10% of |WNS| or 50ps)
 *   - clean:     slack > criticalMargin
 */
import type { TimingPath } from './openroad';

export type SlackBand = 'violation' | 'critical' | 'clean';

export interface SlackBin {
  /** Inclusive lower edge (ns). */
  lo: number;
  /** Exclusive upper edge (ns). */
  hi: number;
  /** Path count in this bin. */
  count: number;
  band: SlackBand;
}

export interface SlackHistogram {
  bins: SlackBin[];
  /** Worst negative slack (ns) — most-negative slack across all paths. */
  wns: number;
  /** Total negative slack (ns) — sum of all negative slacks. */
  tns: number;
  /** Number of paths with slack < 0. */
  violated: number;
  /** Number of paths with 0 ≤ slack ≤ criticalMargin. */
  critical: number;
  /** Number of paths with slack > criticalMargin. */
  clean: number;
  total: number;
  min: number;
  max: number;
  criticalMargin: number;
}

export interface BinOpts {
  /** Number of bins (default 24). */
  bins?: number;
  /** Lower clamp for the histogram range (ns). Defaults to min(slack). */
  min?: number;
  /** Upper clamp for the histogram range (ns). Defaults to max(slack). */
  max?: number;
  /** Slack ≤ this is "critical". Default = max(50ps, 10% of |WNS|). */
  criticalMargin?: number;
}

function toSlacks(input: TimingPath[] | number[]): number[] {
  if (input.length === 0) return [];
  if (typeof input[0] === 'number') return input as number[];
  return (input as TimingPath[]).map(p => p.slack).filter(Number.isFinite);
}

export function binSlacks(
  input: TimingPath[] | number[],
  opts: BinOpts = {},
): SlackHistogram {
  const slacks = toSlacks(input);
  const n = slacks.length;
  if (n === 0) {
    return {
      bins: [],
      wns: 0, tns: 0,
      violated: 0, critical: 0, clean: 0, total: 0,
      min: 0, max: 0, criticalMargin: 0,
    };
  }

  let minS = Infinity, maxS = -Infinity, wns = 0, tns = 0, violated = 0;
  for (const s of slacks) {
    if (s < minS) minS = s;
    if (s > maxS) maxS = s;
    if (s < wns) wns = s;
    if (s < 0) { tns += s; violated++; }
  }

  const criticalMargin = opts.criticalMargin ?? Math.max(0.05, Math.abs(wns) * 0.1);
  let critical = 0;
  for (const s of slacks) if (s >= 0 && s <= criticalMargin) critical++;
  const clean = n - violated - critical;

  const lo = opts.min ?? minS;
  const hi = opts.max ?? maxS;
  const nb = Math.max(1, opts.bins ?? 24);
  // Avoid zero-width bins.
  const span = hi - lo > 0 ? hi - lo : 1;
  const w = span / nb;

  const bins: SlackBin[] = [];
  for (let i = 0; i < nb; i++) {
    const blo = lo + i * w;
    const bhi = i === nb - 1 ? hi + 1e-12 : lo + (i + 1) * w;
    let band: SlackBand;
    if (bhi <= 0) band = 'violation';
    else if (blo >= criticalMargin) band = 'clean';
    else if (blo >= 0) band = 'critical';
    else band = 'violation'; // straddles 0 — colour worst case
    bins.push({ lo: blo, hi: bhi, count: 0, band });
  }
  for (const s of slacks) {
    if (s < lo || s > hi) continue;
    let idx = Math.floor((s - lo) / w);
    if (idx >= nb) idx = nb - 1;
    if (idx < 0) idx = 0;
    bins[idx].count++;
  }

  return {
    bins,
    wns: wns === Infinity ? 0 : wns,
    tns,
    violated, critical, clean,
    total: n,
    min: minS, max: maxS,
    criticalMargin,
  };
}

/** Convenience: pretty-format a slack value in ps/ns. */
export function formatSlack(ns: number): string {
  if (!Number.isFinite(ns)) return '—';
  if (Math.abs(ns) >= 1) return `${ns.toFixed(3)} ns`;
  return `${(ns * 1000).toFixed(1)} ps`;
}
