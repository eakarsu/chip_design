/**
 * Clock-Domain-Crossing (CDC) checker.
 *
 * Given a list of signals (each tagged with its source clock) and a
 * list of register destinations (each with their capture clock and the
 * synchroniser depth applied on the path), classify every crossing as:
 *
 *   - SAFE          : same clock, or async-reset only
 *   - SYNCED_2FF    : depth ≥ 2, single-bit, no convergence
 *   - SYNCED_GRAY   : multi-bit, marked as gray-coded
 *   - HANDSHAKE     : multi-bit + req/ack pair declared
 *   - MULTI_BIT     : multi-bit with no synchroniser scheme — error
 *   - NO_SYNC       : crossing with depth < 2 — error
 *   - GLITCH_RISK   : combinational path between domains — error
 *   - CONVERGENCE   : two crossings from same source converge — warning
 *
 * The model is coarse but useful for sanity-checking handcrafted
 * clock-domain crossings before signoff CDC tools run.
 */
export interface CdcSignal {
  name: string;
  /** Source clock domain. */
  srcClk: string;
  /** Bit-width — anything > 1 needs gray/handshake. */
  width: number;
  /** Marked gray-coded by the designer. */
  gray?: boolean;
  /** Request/ack handshake partner (signal name). */
  handshakeWith?: string;
}

export interface CdcCrossing {
  /** Source signal name. */
  src: string;
  /** Destination register name. */
  dst: string;
  /** Capture clock at dst. */
  dstClk: string;
  /** Number of synchroniser flops (typically 2 or 3). */
  syncDepth: number;
  /** True if there's combinational logic between src flop and sync chain. */
  combinational?: boolean;
}

export interface CdcReport {
  src: string;
  dst: string;
  srcClk: string;
  dstClk: string;
  status:
    | 'SAFE' | 'SYNCED_2FF' | 'SYNCED_GRAY' | 'HANDSHAKE'
    | 'MULTI_BIT' | 'NO_SYNC' | 'GLITCH_RISK' | 'CONVERGENCE';
  severity: 'ok' | 'warn' | 'error';
  message: string;
}

export interface CdcResult {
  reports: CdcReport[];
  errors: number;
  warnings: number;
  /** Domains touched. */
  domains: string[];
}

export function checkCdc(
  signals: CdcSignal[], crossings: CdcCrossing[],
): CdcResult {
  const sigByName = new Map(signals.map(s => [s.name, s]));
  const reports: CdcReport[] = [];
  // Convergence detection: dst-set per source.
  const dstsBySrc = new Map<string, Set<string>>();
  for (const c of crossings) {
    if (!dstsBySrc.has(c.src)) dstsBySrc.set(c.src, new Set());
    dstsBySrc.get(c.src)!.add(c.dst);
  }
  const domains = new Set<string>();
  let errors = 0, warnings = 0;
  for (const c of crossings) {
    const sig = sigByName.get(c.src);
    if (!sig) {
      reports.push({
        src: c.src, dst: c.dst, srcClk: '?', dstClk: c.dstClk,
        status: 'NO_SYNC', severity: 'error',
        message: `unknown source signal ${c.src}`,
      });
      errors++;
      continue;
    }
    domains.add(sig.srcClk); domains.add(c.dstClk);
    if (sig.srcClk === c.dstClk) {
      reports.push({
        src: c.src, dst: c.dst, srcClk: sig.srcClk, dstClk: c.dstClk,
        status: 'SAFE', severity: 'ok',
        message: 'same clock domain',
      });
      continue;
    }
    if (c.combinational) {
      reports.push({
        src: c.src, dst: c.dst, srcClk: sig.srcClk, dstClk: c.dstClk,
        status: 'GLITCH_RISK', severity: 'error',
        message: 'combinational path between domains',
      });
      errors++;
      continue;
    }
    if (c.syncDepth < 2) {
      reports.push({
        src: c.src, dst: c.dst, srcClk: sig.srcClk, dstClk: c.dstClk,
        status: 'NO_SYNC', severity: 'error',
        message: `sync depth ${c.syncDepth} < 2`,
      });
      errors++;
      continue;
    }
    if (sig.width > 1) {
      if (sig.gray) {
        reports.push({
          src: c.src, dst: c.dst, srcClk: sig.srcClk, dstClk: c.dstClk,
          status: 'SYNCED_GRAY', severity: 'ok',
          message: `${sig.width}-bit gray-coded crossing`,
        });
      } else if (sig.handshakeWith) {
        reports.push({
          src: c.src, dst: c.dst, srcClk: sig.srcClk, dstClk: c.dstClk,
          status: 'HANDSHAKE', severity: 'ok',
          message: `handshake with ${sig.handshakeWith}`,
        });
      } else {
        reports.push({
          src: c.src, dst: c.dst, srcClk: sig.srcClk, dstClk: c.dstClk,
          status: 'MULTI_BIT', severity: 'error',
          message: `${sig.width}-bit crossing without gray/handshake`,
        });
        errors++;
      }
      continue;
    }
    const dsts = dstsBySrc.get(c.src)!;
    if (dsts.size > 1) {
      reports.push({
        src: c.src, dst: c.dst, srcClk: sig.srcClk, dstClk: c.dstClk,
        status: 'CONVERGENCE', severity: 'warn',
        message: `source ${c.src} drives ${dsts.size} synchronisers`,
      });
      warnings++;
    } else {
      reports.push({
        src: c.src, dst: c.dst, srcClk: sig.srcClk, dstClk: c.dstClk,
        status: 'SYNCED_2FF', severity: 'ok',
        message: `${c.syncDepth}-FF synchroniser`,
      });
    }
  }
  return { reports, errors, warnings, domains: [...domains] };
}
