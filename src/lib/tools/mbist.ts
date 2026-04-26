/**
 * MBIST (Memory Built-In Self-Test) inserter.
 *
 * Wraps a list of SRAM/ROM macros with a MARCH-C− pattern controller
 * and reports cycle counts, area overhead, and per-macro test time.
 *
 * MARCH-C− has 6 elements (10·N reads/writes total):
 *   ⇕(w0) ; ⇑(r0,w1) ; ⇑(r1,w0) ; ⇓(r0,w1) ; ⇓(r1,w0) ; ⇕(r0)
 * giving full SAF + CF coverage in 10·N memory accesses where N = depth.
 */
export interface MbistMacro {
  name: string;
  /** Number of words. */
  depth: number;
  /** Word width (bits). */
  width: number;
  /** Cell area (μm²). 0 disables area accounting. */
  cellAreaUm2?: number;
}

export interface MbistSpec {
  macros: MbistMacro[];
  /** Test clock period (ns). */
  clockNs: number;
  /** Per-macro wrapper area cost in equivalent NAND2 (≈ 1 μm² in modern). */
  wrapperGates?: number;
}

export interface MbistMacroReport {
  name: string;
  bits: number;
  cycles: number;
  testTimeUs: number;
  wrapperAreaUm2: number;
}

export interface MbistResult {
  macros: MbistMacroReport[];
  totalCycles: number;
  totalTestTimeUs: number;
  totalWrapperAreaUm2: number;
  /** Algorithm description (for reports). */
  algorithm: string;
}

const MARCH_CM_FACTOR = 10; // r/w accesses per word

export function planMbist(spec: MbistSpec): MbistResult {
  if (spec.clockNs <= 0) throw new Error('clockNs must be positive');
  const wrapperGates = spec.wrapperGates ?? 200;
  const wrapperAreaPerMacro = wrapperGates * 1.0; // μm² (approx 1 μm²/NAND2)
  let totCyc = 0, totTime = 0, totArea = 0;
  const macros: MbistMacroReport[] = spec.macros.map(m => {
    const cycles = MARCH_CM_FACTOR * m.depth;
    const testTimeUs = cycles * spec.clockNs / 1000;
    totCyc += cycles;
    totTime += testTimeUs;
    totArea += wrapperAreaPerMacro;
    return {
      name: m.name,
      bits: m.depth * m.width,
      cycles,
      testTimeUs,
      wrapperAreaUm2: wrapperAreaPerMacro,
    };
  });
  return {
    macros,
    totalCycles: totCyc,
    totalTestTimeUs: totTime,
    totalWrapperAreaUm2: totArea,
    algorithm: 'MARCH-C− (10N: ⇕w0; ⇑r0w1; ⇑r1w0; ⇓r0w1; ⇓r1w0; ⇕r0)',
  };
}
