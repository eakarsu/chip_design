/**
 * TCAM (Ternary Content-Addressable Memory) cell estimator.
 *
 * Estimate area, power, and search latency for a TCAM array used for
 * routing tables / ACL lookups. Each TCAM cell stores 0/1/X using
 * 16T (NOR-style) or 14T (NAND-style) topology — we pick at the
 * field level.
 *
 * Area scales linearly with cells. Search energy is dominated by the
 * matchline pre-charge; we model it as proportional to cells × bits ×
 * Vdd². Latency depends on the matchline length: longer rows → bigger
 * RC, higher delay.
 */
export type TcamCellType = 'NOR_16T' | 'NAND_14T';

export interface TcamSpec {
  /** Number of entries (rows). */
  entries: number;
  /** Bits per entry (width of search key). */
  widthBits: number;
  cellType: TcamCellType;
  /** Technology node (nm). */
  techNm: number;
  /** Supply voltage (V). */
  vdd?: number;
}

export interface TcamResult {
  /** Total cells. */
  cells: number;
  /** Total area (μm²). */
  areaUm2: number;
  /** Search energy per lookup (pJ). */
  searchEnergyPj: number;
  /** Search latency (ns). */
  searchNs: number;
  /** Static power (mW). */
  leakageMw: number;
  /** Lookups per second budget if energy capped at maxPowerMw (if provided). */
  maxLookupsPerSec?: number;
}

export interface TcamPowerCap {
  maxPowerMw: number;
}

const VDD_REF = 0.9;

export function estimateTcam(spec: TcamSpec, cap?: TcamPowerCap): TcamResult {
  if (spec.entries <= 0 || spec.widthBits <= 0) {
    throw new Error('entries and widthBits must be > 0');
  }
  const cells = spec.entries * spec.widthBits;
  const node = spec.techNm;
  const vdd  = spec.vdd ?? 0.9;
  const tCells = spec.cellType === 'NOR_16T' ? 16 : 14;
  // Cell area: gate-area-equivalent ~ tCells × (node²/16²) × ~0.04 μm² per gate.
  const cellAreaUm2 = tCells * (node / 16) ** 2 * 0.04;
  const areaUm2 = cells * cellAreaUm2 * 1.3; // 1.3× periphery factor

  // NOR matchline pre-charge: energy ~ entries × widthBits × Vdd².
  const v2 = (vdd * vdd) / (VDD_REF * VDD_REF);
  const searchEnergyPj = cells * 0.0025 * v2 *
    (spec.cellType === 'NOR_16T' ? 1.0 : 0.7);

  // Latency: matchline RC scales with widthBits; NAND chain adds widthBits log.
  const nodeFactor = Math.sqrt(node / 16);
  const searchNs = (
    0.10 + 0.004 * spec.widthBits +
    (spec.cellType === 'NAND_14T' ? 0.01 * Math.log2(spec.widthBits) : 0)
  ) * nodeFactor;

  // Leakage: 0.8 nW/cell at 16 nm × node-scale × Vdd.
  const leakageMw = cells * 0.8e-9 * (16 / node) * vdd * 1000;

  const result: TcamResult = {
    cells, areaUm2, searchEnergyPj, searchNs, leakageMw,
  };
  if (cap) {
    // Power per lookup × lookups/sec ≤ maxPowerMw. P = E × f.
    // E (pJ) × f (Hz) = E×f × 1e-12 W. We want ≤ maxPowerMw × 1e-3 W.
    const maxLookups = (cap.maxPowerMw * 1e-3) / (searchEnergyPj * 1e-12);
    result.maxLookupsPerSec = maxLookups;
  }
  return result;
}
