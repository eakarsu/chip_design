/**
 * Functional / code coverage database merger.
 *
 * Each input "database" is a flat map of `bin → hits`. Merging unions
 * the bin sets and sums the hit counts. We compute aggregate coverage
 * as the fraction of bins that received ≥ `minHits` hits. Tags can be
 * scoped to a hierarchical name (e.g. `cpu.alu.add_carry`) so we can
 * report per-module coverage too.
 */
export interface CovDb {
  name: string;
  bins: Record<string, number>;
}

export interface CovSpec {
  dbs: CovDb[];
  /** Bins must hit ≥ minHits to count as covered. Default 1. */
  minHits?: number;
}

export interface CovResult {
  merged: Record<string, number>;
  totalBins: number;
  covered: number;
  coverage: number;
  /** Per-module coverage keyed by leading dotted prefix. */
  byModule: { module: string; total: number; covered: number; coverage: number }[];
  /** Per-DB contribution (unique bins this DB hit that nobody else did). */
  perDbUnique: { name: string; uniqueHits: number }[];
}

export function mergeCoverage(spec: CovSpec): CovResult {
  const minHits = spec.minHits ?? 1;
  const merged: Record<string, number> = {};
  for (const db of spec.dbs) {
    for (const [bin, hits] of Object.entries(db.bins)) {
      if (typeof hits !== 'number' || hits < 0) {
        throw new Error(`bad hit count in ${db.name}/${bin}`);
      }
      merged[bin] = (merged[bin] ?? 0) + hits;
    }
  }
  const totalBins = Object.keys(merged).length;
  const covered = Object.values(merged).filter(v => v >= minHits).length;

  // Per-module: split bin names on first dot.
  const modAgg = new Map<string, { total: number; covered: number }>();
  for (const [bin, hits] of Object.entries(merged)) {
    const mod = bin.includes('.') ? bin.split('.')[0] : '<top>';
    if (!modAgg.has(mod)) modAgg.set(mod, { total: 0, covered: 0 });
    const e = modAgg.get(mod)!;
    e.total++;
    if (hits >= minHits) e.covered++;
  }
  const byModule = [...modAgg.entries()]
    .map(([module, e]) => ({
      module, total: e.total, covered: e.covered,
      coverage: e.total > 0 ? e.covered / e.total : 0,
    }))
    .sort((a, b) => a.module.localeCompare(b.module));

  // Unique-hits per DB: bins where this DB > 0 and no other DB > 0.
  const perDbUnique = spec.dbs.map(db => {
    let uniq = 0;
    for (const [bin, hits] of Object.entries(db.bins)) {
      if (hits <= 0) continue;
      let othersHit = false;
      for (const other of spec.dbs) {
        if (other === db) continue;
        if ((other.bins[bin] ?? 0) > 0) { othersHit = true; break; }
      }
      if (!othersHit) uniq++;
    }
    return { name: db.name, uniqueHits: uniq };
  });

  return {
    merged, totalBins, covered,
    coverage: totalBins > 0 ? covered / totalBins : 0,
    byModule, perDbUnique,
  };
}
