/**
 * SRAM array planner.
 *
 * Given a target capacity (bits), word width, and a set of compiler
 * constraints (max words per bank, max bits per row, mux factor),
 * pick the bank/row/column factoring that minimises area subject to a
 * row-cycle (access-time) ceiling.
 *
 * Cell area model:
 *   bit-cell area = cellAreaUm2 (μm² per bit)
 *   periphery overhead = (rowDecoder + senseAmps) × area-per-mm-of-row
 * We iterate over row counts R that divide the bank depth and pick the
 * R that minimises total area while keeping "row drive" delay below
 * the access cap. Row delay is modelled as:
 *   t_word = t0 + α · log2(R) + β · C
 * where C = bits-per-row, with α, β tuning constants.
 */
export interface SramSpec {
  /** Total capacity (bits). */
  capacityBits: number;
  /** Word width (bits). */
  wordBits: number;
  /** Bit-cell area (μm²). */
  cellAreaUm2: number;
  /** Maximum number of banks. */
  maxBanks?: number;
  /** Mux factor (column mux). 1 / 2 / 4 / 8. */
  muxFactor: number;
  /** Target access time (ns). */
  targetAccessNs: number;
}

export interface SramPlan {
  banks: number;
  rowsPerBank: number;
  bitsPerRow: number;
  totalBits: number;
  /** Cell area (μm²). */
  cellAreaUm2: number;
  /** Periphery overhead (μm²). */
  peripheryUm2: number;
  totalAreaUm2: number;
  accessNs: number;
}

export interface SramResult {
  best: SramPlan;
  candidates: SramPlan[];
  /** Reason for selection / explanation. */
  notes: string[];
}

/** Periphery cost in μm² per row + per column. Tuned for a 16nm-ish process. */
const ROW_DECODE_PER_ROW = 1.2;
const SENSE_AMP_PER_COL  = 1.6;
/** Access time model coefficients (ns). */
const T0 = 0.18;
const A_LOG = 0.05;
const B_LIN = 0.0008; // per bit of row width

export function planSram(spec: SramSpec): SramResult {
  if (spec.capacityBits <= 0) throw new Error('capacityBits must be > 0');
  if (spec.wordBits <= 0) throw new Error('wordBits must be > 0');
  if (![1, 2, 4, 8].includes(spec.muxFactor)) {
    throw new Error('muxFactor must be 1, 2, 4, or 8');
  }
  const maxBanks = spec.maxBanks ?? 16;
  const candidates: SramPlan[] = [];
  const notes: string[] = [];

  // Try each bank count that divides into a power of 2 up to maxBanks.
  for (let banks = 1; banks <= maxBanks; banks *= 2) {
    const bitsPerBank = spec.capacityBits / banks;
    if (!Number.isFinite(bitsPerBank) || bitsPerBank < spec.wordBits) continue;
    // Sweep rows-per-bank as power of 2.
    for (let rows = 16; rows <= bitsPerBank / spec.wordBits; rows *= 2) {
      const bitsPerRow = bitsPerBank / rows;
      if (bitsPerRow < spec.wordBits * spec.muxFactor) continue;
      const totalBits = banks * rows * bitsPerRow;
      const cellArea = totalBits * spec.cellAreaUm2;
      const periphery = banks *
        (rows * ROW_DECODE_PER_ROW + bitsPerRow * SENSE_AMP_PER_COL);
      const access = T0 + A_LOG * Math.log2(rows) + B_LIN * bitsPerRow;
      candidates.push({
        banks, rowsPerBank: rows, bitsPerRow, totalBits,
        cellAreaUm2: cellArea, peripheryUm2: periphery,
        totalAreaUm2: cellArea + periphery,
        accessNs: access,
      });
    }
  }
  if (candidates.length === 0) {
    throw new Error('no valid SRAM configuration for spec');
  }
  // Filter by access target; if none qualify, keep the fastest.
  let viable = candidates.filter(c => c.accessNs <= spec.targetAccessNs);
  if (viable.length === 0) {
    notes.push(`no plan meets target access ${spec.targetAccessNs}ns; picking fastest`);
    viable = candidates.slice().sort((a, b) => a.accessNs - b.accessNs).slice(0, 1);
  }
  // Of the viable, pick smallest total area.
  viable.sort((a, b) => a.totalAreaUm2 - b.totalAreaUm2);
  const best = viable[0];
  return { best, candidates, notes };
}
