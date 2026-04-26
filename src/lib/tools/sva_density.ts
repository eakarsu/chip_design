/**
 * SVA assertion density map.
 *
 * Counts SystemVerilog assertions per module from a list of source
 * files. Each file has a module name (or directory tag) and source
 * text — we count `assert property`, `assume property`, `cover
 * property`, `cover sequence`, `assert final`, immediate `assert(`,
 * and `$cover()`. Density is assertions per kLOC.
 *
 * We classify modules by density so the UI can rank "verification
 * holes" (low density, high LOC) vs "well-asserted" code.
 */
export interface SvaModule {
  name: string;
  /** SystemVerilog source text. */
  source: string;
}

export interface SvaSpec {
  modules: SvaModule[];
  /** Threshold for "high" density (per kLOC). Default 5. */
  highPerKloc?: number;
  /** Threshold for "low" density (per kLOC). Default 1. */
  lowPerKloc?: number;
}

export interface SvaModReport {
  module: string;
  loc: number;
  asserts: number;
  assumes: number;
  covers: number;
  density: number;
  band: 'low' | 'mid' | 'high';
}

export interface SvaResult {
  reports: SvaModReport[];
  totalLoc: number;
  totalAsserts: number;
  totalAssumes: number;
  totalCovers: number;
  /** Overall density per kLOC. */
  overallDensity: number;
}

const RE = {
  asserts: /\bassert(?:\s+property|\s+final|\s*\()/g,
  assumes: /\bassume\s+property\b/g,
  covers:  /\bcover\s+(?:property|sequence)\b|\$cover\s*\(/g,
};

function nonBlankLoc(src: string): number {
  return src.split(/\r?\n/).filter(l => l.trim() && !l.trim().startsWith('//')).length;
}

export function computeSvaDensity(spec: SvaSpec): SvaResult {
  const high = spec.highPerKloc ?? 5;
  const low  = spec.lowPerKloc  ?? 1;
  const reports: SvaModReport[] = [];
  let totLoc = 0, totA = 0, totU = 0, totC = 0;
  for (const m of spec.modules) {
    if (typeof m.source !== 'string') {
      throw new Error(`module ${m.name}: source must be string`);
    }
    const loc = nonBlankLoc(m.source);
    const a = (m.source.match(RE.asserts) ?? []).length;
    const u = (m.source.match(RE.assumes) ?? []).length;
    const c = (m.source.match(RE.covers)  ?? []).length;
    const total = a + u + c;
    const density = loc > 0 ? (total / loc) * 1000 : 0;
    let band: SvaModReport['band'] = 'mid';
    if (density >= high) band = 'high';
    else if (density < low) band = 'low';
    reports.push({
      module: m.name, loc, asserts: a, assumes: u, covers: c, density, band,
    });
    totLoc += loc; totA += a; totU += u; totC += c;
  }
  return {
    reports,
    totalLoc: totLoc,
    totalAsserts: totA, totalAssumes: totU, totalCovers: totC,
    overallDensity: totLoc > 0 ? ((totA + totU + totC) / totLoc) * 1000 : 0,
  };
}
