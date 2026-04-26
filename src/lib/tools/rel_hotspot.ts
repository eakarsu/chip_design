/**
 * Combined IR-drop × EM reliability hotspot map.
 *
 * Given two grids of equal shape — one with normalised IR-drop
 * stress (0..1) and one with normalised EM stress (0..1) — we form
 * the joint reliability score
 *
 *     R(i,j) = sqrt(IR(i,j)² + EM(i,j)²)
 *
 * and rank the worst tiles. This is a quick way to identify regions
 * that need both wider straps AND more decap.
 */
export interface RelGrid {
  /** Number of columns (x). */
  cols: number;
  /** Number of rows (y). */
  rows: number;
  /** Row-major data, length = cols·rows. */
  data: number[];
}

export interface HotspotTile {
  col: number;
  row: number;
  ir: number;
  em: number;
  score: number;
}

export interface HotspotResult {
  scoreGrid: RelGrid;
  worst: HotspotTile[];
  /** Mean and max scores. */
  meanScore: number;
  maxScore: number;
  warnings: string[];
}

export function combineHotspots(
  ir: RelGrid, em: RelGrid, topN = 10,
): HotspotResult {
  if (ir.cols !== em.cols || ir.rows !== em.rows) {
    throw new Error('IR and EM grids must match shape');
  }
  if (ir.data.length !== ir.cols * ir.rows) {
    throw new Error('IR grid length mismatch');
  }
  if (em.data.length !== em.cols * em.rows) {
    throw new Error('EM grid length mismatch');
  }
  const n = ir.data.length;
  const score: number[] = new Array(n);
  const tiles: HotspotTile[] = [];
  let sum = 0, max = 0;
  for (let i = 0; i < n; i++) {
    const a = ir.data[i] ?? 0;
    const b = em.data[i] ?? 0;
    const s = Math.hypot(a, b);
    score[i] = s;
    sum += s;
    if (s > max) max = s;
    tiles.push({
      col: i % ir.cols, row: Math.floor(i / ir.cols),
      ir: a, em: b, score: s,
    });
  }
  tiles.sort((p, q) => q.score - p.score);
  const worst = tiles.slice(0, Math.max(0, topN | 0));
  return {
    scoreGrid: { cols: ir.cols, rows: ir.rows, data: score },
    worst,
    meanScore: n > 0 ? sum / n : 0,
    maxScore: max,
    warnings: [],
  };
}
