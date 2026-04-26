/**
 * Memory BIST collar / wrapper builder.
 *
 * Where #48 (planMbist) computed pure cycle/algorithm budgets, this
 * tool focuses on the *physical wrapper* around a group of memories:
 *   - per-memory test mux (functional ↔ BIST data path) area
 *   - a shared TPG (test pattern generator) + MISR (signature reg)
 *     amortised across N memories
 *   - daisy-chain scan-out of MISR signatures to a single TDR
 *   - retention test mode toggle and gated-clock for low-power scan
 *
 * Output is the per-memory and aggregate area, plus the diagnostic
 * resolution (how many failing memories the chained signature can
 * isolate without re-running a per-array test).
 */
export interface BistMemory {
  name: string;
  /** Word width — sets per-mem mux/regfile width. */
  width: number;
  /** Address width in bits. */
  addrBits: number;
  /** True if this memory needs a separate retention-test wrapper. */
  retention?: boolean;
}

export interface BistWrapSpec {
  memories: BistMemory[];
  /** Whether to share a single TPG across all memories. Default true. */
  sharedTpg?: boolean;
  /** Gates per mux bit (NAND2 equivalent). */
  muxGatesPerBit?: number;
  /** Gates per MISR / TPG flop. */
  flopGates?: number;
  /** Daisy-chain target: max diag groups (1 = no chaining). */
  diagGroups?: number;
}

export interface BistMemReport {
  name: string;
  muxBits: number;
  muxGates: number;
  /** MISR width sized to log2(addr+data). */
  misrBits: number;
  retentionGates: number;
  totalGates: number;
}

export interface BistWrapResult {
  reports: BistMemReport[];
  sharedTpgGates: number;
  totalGates: number;
  /** Number of distinct diagnostic chains (= diagGroups, capped). */
  diagGroups: number;
  /** Diagnostic resolution: failing memories per chain. */
  diagResolution: number;
}

export function planBistWrap(spec: BistWrapSpec): BistWrapResult {
  if (!Array.isArray(spec.memories) || !spec.memories.length) {
    throw new Error('memories required');
  }
  const muxGatesPerBit = spec.muxGatesPerBit ?? 4;   // 2:1 mux ≈ 4 NAND2
  const flopGates      = spec.flopGates      ?? 6;   // FF ≈ 6 NAND2
  const sharedTpg      = spec.sharedTpg      ?? true;
  const diagGroups     = Math.max(1, Math.min(
    spec.diagGroups ?? 1, spec.memories.length,
  ));
  const reports: BistMemReport[] = [];
  let total = 0;
  for (const m of spec.memories) {
    if (m.width <= 0 || m.addrBits <= 0) {
      throw new Error(`bad geometry for ${m.name}`);
    }
    const muxBits = m.width + m.addrBits;
    const muxGates = muxBits * muxGatesPerBit;
    // Per-mem MISR: width sized to widest data path.
    const misrBits = m.width;
    const misrGates = misrBits * flopGates;
    const retentionGates = m.retention ? 30 + m.width * 2 : 0;
    const memTotal = muxGates + misrGates + retentionGates;
    reports.push({
      name: m.name, muxBits, muxGates, misrBits,
      retentionGates, totalGates: memTotal,
    });
    total += memTotal;
  }
  // Shared TPG: 12-bit LFSR + a few control flops.
  const sharedTpgGates = sharedTpg ? 12 * flopGates + 50 : 0;
  total += sharedTpgGates;
  // If multi-group diagnosis, replicate TPG control by group count.
  if (diagGroups > 1) total += (diagGroups - 1) * 40;

  return {
    reports,
    sharedTpgGates,
    totalGates: total,
    diagGroups,
    diagResolution: Math.ceil(spec.memories.length / diagGroups),
  };
}
