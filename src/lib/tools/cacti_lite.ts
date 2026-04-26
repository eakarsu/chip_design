/**
 * CACTI-lite: cache geometry + access-time / energy estimator.
 *
 * Toy emulation of the CACTI model. Inputs: cache size, line size,
 * associativity, technology node. We compute number of sets, tag
 * width, way-mux delay, and an analytic access time + per-access
 * energy.
 *
 * Access time model:
 *   t = t_decode + t_array + t_waymux + t_compare
 * Each component is a small function of the array dimensions and
 * tech node (in nm).
 *
 * Energy:
 *   E = E_array + E_tag + E_waymux
 * scaled by Vdd² / Vdd_ref² where Vdd is process-typical.
 */
export interface CactiSpec {
  /** Cache capacity (bytes). */
  sizeBytes: number;
  /** Line / block size (bytes). */
  lineBytes: number;
  /** Associativity (ways); 1 = direct-mapped. */
  assoc: number;
  /** Address width (bits). */
  addressBits: number;
  /** Technology node (nm). */
  techNm: number;
  /** Supply voltage (V). */
  vdd?: number;
}

export interface CactiResult {
  sets: number;
  tagBits: number;
  indexBits: number;
  offsetBits: number;
  /** Access latency (ns). */
  accessNs: number;
  /** Per-access dynamic energy (pJ). */
  energyPj: number;
  /** Static / leakage power estimate (mW). */
  leakageMw: number;
  /** Total area estimate (mm²). */
  areaMm2: number;
  notes: string[];
}

const VDD_REF = 0.9;

export function estimateCache(spec: CactiSpec): CactiResult {
  if (spec.sizeBytes <= 0 || spec.lineBytes <= 0 || spec.assoc < 1) {
    throw new Error('positive sizes / assoc >= 1 required');
  }
  if (spec.sizeBytes % (spec.lineBytes * spec.assoc) !== 0) {
    throw new Error('size must equal lineBytes × assoc × sets');
  }
  const sets = spec.sizeBytes / (spec.lineBytes * spec.assoc);
  if (!Number.isInteger(Math.log2(sets)) || !Number.isInteger(Math.log2(spec.lineBytes))) {
    throw new Error('sets and lineBytes must be powers of 2');
  }
  const offsetBits = Math.log2(spec.lineBytes);
  const indexBits = Math.log2(sets);
  const tagBits = spec.addressBits - indexBits - offsetBits;
  if (tagBits <= 0) throw new Error('addressBits too small for this geometry');

  const vdd = spec.vdd ?? 0.9;
  const node = spec.techNm;
  // Component delays (ns), scaled by node.
  const nodeFactor = Math.sqrt(node / 16);
  const tDecode  = (0.05 + 0.01 * indexBits) * nodeFactor;
  const tArray   = (0.10 + 0.005 * Math.log2(sets * spec.lineBytes * 8)) * nodeFactor;
  const tWayMux  = (0.02 + 0.01 * Math.log2(spec.assoc)) * nodeFactor;
  const tCompare = (0.04 + 0.002 * tagBits) * nodeFactor;
  const accessNs = tDecode + tArray + tWayMux + tCompare;

  // Energy (pJ): proportional to active bits & V².
  const cellsAccessed = spec.assoc * spec.lineBytes * 8;
  const eArray  = cellsAccessed * 0.0008;
  const eTag    = spec.assoc * tagBits * 0.001;
  const eMux    = Math.log2(spec.assoc) * 0.5;
  const energyPj = (eArray + eTag + eMux) * (vdd * vdd) / (VDD_REF * VDD_REF);

  // Area: cell density ~ 0.07 μm²/bit at 16 nm, scales with node².
  const bits = spec.sizeBytes * 8 + sets * spec.assoc * tagBits;
  const cellAreaUm2PerBit = 0.07 * (node / 16) ** 2;
  const areaMm2 = (bits * cellAreaUm2PerBit) / 1e6 * 1.4; // 1.4× periphery factor

  // Leakage power: I_off × Vdd × cells. Toy: 0.5 nW/bit at 16nm × node-scale.
  const leakagePerBit = 0.5e-9 * (16 / node);
  const leakageMw = bits * leakagePerBit * vdd * 1000;

  const notes: string[] = [];
  if (spec.assoc > 16) notes.push('high associativity — way-mux delay dominates');
  if (sets < 16) notes.push('low set count — high conflict-miss risk');

  return {
    sets, tagBits, indexBits, offsetBits,
    accessNs, energyPj, leakageMw, areaMm2, notes,
  };
}
