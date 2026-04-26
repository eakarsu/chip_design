/**
 * DRAM refresh planner.
 *
 * JEDEC DDR specifies a retention time tREF (typically 64 ms at <85°C,
 * halved every +10°C) over which every row must be refreshed. We
 * compute:
 *   - Total refreshes per tREF window (rows per bank × banks).
 *   - Refresh interval tREFI = tREF / refreshes-per-window.
 *   - tRFC (refresh cycle time) overhead as fraction of bus time.
 *   - Bandwidth lost to refresh.
 *
 * Temperature derating follows the rule that retention halves every
 * 10°C above 85°C.
 */
export interface DramSpec {
  /** Banks per device. */
  banks: number;
  /** Rows per bank. */
  rowsPerBank: number;
  /** Column count per row. */
  colsPerRow: number;
  /** Word width (bits). */
  wordBits: number;
  /** Refresh cycle time (ns) per row refresh. */
  trfcNs: number;
  /** Retention time at 85°C (ms). Default 64. */
  tRefMs85?: number;
  /** Operating temperature (°C). */
  tempC: number;
  /** Bus clock period (ns). */
  clockNs: number;
}

export interface DramRefreshResult {
  /** Effective retention at the operating temperature (ms). */
  effectiveTRefMs: number;
  /** Total rows to refresh in one window. */
  refreshesPerWindow: number;
  /** Refresh interval tREFI (ns). */
  trefiNs: number;
  /** Refresh duty cycle (% of bus time spent refreshing). */
  dutyPct: number;
  /** Effective bandwidth after refresh (GB/s). */
  effectiveGbps: number;
  /** Peak bandwidth before refresh loss (GB/s). */
  peakGbps: number;
  notes: string[];
}

export function planRefresh(spec: DramSpec): DramRefreshResult {
  if (spec.banks < 1 || spec.rowsPerBank < 1) {
    throw new Error('banks and rowsPerBank must be >= 1');
  }
  if (spec.clockNs <= 0) throw new Error('clockNs must be > 0');
  const tRef85 = spec.tRefMs85 ?? 64;
  // Halve retention per +10°C above 85°C; double per −10°C below 85°C
  // (capped at +10× to keep numbers sane).
  const halvings = (spec.tempC - 85) / 10;
  const effectiveTRefMs = Math.min(tRef85 * 10, tRef85 * Math.pow(2, -halvings));
  const refreshesPerWindow = spec.banks * spec.rowsPerBank;
  const trefiNs = (effectiveTRefMs * 1e6) / refreshesPerWindow;
  // Duty: each refresh costs trfcNs.
  const dutyPct = Math.min(100, (spec.trfcNs / trefiNs) * 100);
  // Bandwidth: bus delivers wordBits per clock; refresh blocks the bus.
  const peakGbps = (spec.wordBits / 8) / (spec.clockNs * 1e-9) / 1e9;
  const effectiveGbps = peakGbps * (1 - dutyPct / 100);
  const notes: string[] = [];
  if (dutyPct > 5) notes.push('refresh exceeds 5% — consider all-bank refresh batching');
  if (spec.tempC >= 95) notes.push('extended-temp range — consider 32 ms (2× refresh) mode');
  return {
    effectiveTRefMs,
    refreshesPerWindow,
    trefiNs,
    dutyPct,
    peakGbps,
    effectiveGbps,
    notes,
  };
}
