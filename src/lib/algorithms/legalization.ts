/**
 * Standard-cell legalization.
 *
 * Global placement leaves cells in roughly the right neighborhood but
 * usually overlapping and off-grid. Legalization snaps them to legal row
 * positions while perturbing them as little as possible.
 *
 * Two algorithms here:
 *
 *   1. **Tetris** (Hill 2002) — sweep cells left-to-right, drop each one
 *      into the row whose current right-edge gives the smallest x-shift.
 *      Fast and intuitive but greedy: cells placed early can box out
 *      later cells, forcing big shifts.
 *
 *   2. **Abacus** (Spindler 2008) — same outer loop, but uses a per-row
 *      "cluster" data structure that lets us compute the optimal shift
 *      under the L1 cost (sum of |x_new - x_orig|). Strictly better than
 *      Tetris on quality, almost as fast.
 *
 * Both share the same row model: chip is sliced horizontally into rows of
 * height `rowHeight = max cell height`, and cells get snapped to row Y.
 */

import {
  PlacementParams,
  PlacementResult,
  Cell,
} from '@/types/algorithms';

interface Row {
  y: number;
  height: number;
  /** Cells already legalized in this row, sorted by x. */
  cells: Cell[];
  /** Right-edge of the last cell — start of the next free slot. */
  nextX: number;
}

function buildRows(chipWidth: number, chipHeight: number, rowHeight: number): Row[] {
  const rows: Row[] = [];
  for (let y = 0; y + rowHeight <= chipHeight; y += rowHeight) {
    rows.push({ y, height: rowHeight, cells: [], nextX: 0 });
  }
  return rows;
}

function totalWirelengthHPWL(cells: Cell[], nets: { pins: string[] }[]): number {
  // Map pin id -> cell center.
  const pinPos = new Map<string, { x: number; y: number }>();
  for (const c of cells) {
    if (!c.position) continue;
    for (const p of c.pins) {
      pinPos.set(p.id, {
        x: c.position.x + p.position.x,
        y: c.position.y + p.position.y,
      });
    }
  }
  let total = 0;
  for (const n of nets) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let hits = 0;
    for (const pid of n.pins) {
      const pos = pinPos.get(pid);
      if (!pos) continue;
      hits++;
      if (pos.x < minX) minX = pos.x;
      if (pos.x > maxX) maxX = pos.x;
      if (pos.y < minY) minY = pos.y;
      if (pos.y > maxY) maxY = pos.y;
    }
    if (hits >= 2) total += (maxX - minX) + (maxY - minY);
  }
  return total;
}

function seedPositions(cells: Cell[], chipWidth: number, chipHeight: number): Cell[] {
  // If cells already have positions, leave them. Otherwise lay them out in a
  // simple row-major grid so legalization has something to start from.
  const out = cells.map(c => ({ ...c, position: c.position ? { ...c.position } : undefined }));
  const need = out.filter(c => !c.position);
  if (need.length === 0) return out;
  const cols = Math.max(1, Math.ceil(Math.sqrt(need.length)));
  const cellW = chipWidth / cols;
  const rows = Math.ceil(need.length / cols);
  const cellH = chipHeight / Math.max(1, rows);
  for (let i = 0; i < need.length; i++) {
    const r = Math.floor(i / cols);
    const c = i % cols;
    need[i].position = { x: c * cellW, y: r * cellH };
  }
  return out;
}

/* --------------------------------------------------------------------- */
/* Tetris                                                                  */
/* --------------------------------------------------------------------- */

export function tetrisLegalization(params: PlacementParams): PlacementResult {
  const start = performance.now();
  const seeded = seedPositions(params.cells, params.chipWidth, params.chipHeight);
  const rowHeight = Math.max(...seeded.map(c => c.height), 1);
  const rows = buildRows(params.chipWidth, params.chipHeight, rowHeight);

  // Sort cells by their global-placement x — leftmost first.
  const order = seeded
    .map((c, i) => ({ c, i, x: c.position!.x }))
    .sort((a, b) => a.x - b.x);

  const placed = new Array<Cell>(seeded.length);

  for (const { c, i } of order) {
    let bestRow: Row | null = null;
    let bestCost = Infinity;
    let bestX = 0;

    for (const row of rows) {
      // Earliest position the cell can go: max(its desired x, row's nextX).
      const x = Math.max(c.position!.x, row.nextX);
      if (x + c.width > params.chipWidth) continue; // wouldn't fit
      // Cost = how far we shifted it from its desired (x, y).
      const cost = Math.abs(x - c.position!.x) + Math.abs(row.y - c.position!.y);
      if (cost < bestCost) { bestCost = cost; bestRow = row; bestX = x; }
    }

    // If nothing fits, fall back to the row with the most slack and overflow.
    if (!bestRow) {
      bestRow = rows.reduce((a, b) => (a.nextX <= b.nextX ? a : b));
      bestX = bestRow.nextX;
    }

    const placedCell: Cell = {
      ...c,
      position: { x: bestX, y: bestRow.y },
    };
    bestRow.cells.push(placedCell);
    bestRow.nextX = bestX + c.width;
    placed[i] = placedCell;
  }

  const wl = totalWirelengthHPWL(placed, params.nets);
  return {
    success: true,
    cells: placed,
    totalWirelength: wl,
    overlap: 0, // tetris is overlap-free by construction (modulo overflow)
    runtime: performance.now() - start,
    iterations: 1,
  };
}

/* --------------------------------------------------------------------- */
/* Abacus                                                                  */
/* --------------------------------------------------------------------- */

/**
 * A "cluster" is a contiguous run of cells that have been merged together.
 * We track total weight, weighted-sum of preferred x's, and total width so
 * the optimal cluster x is `q / weight` clamped into the row.
 */
interface Cluster {
  cells: { cell: Cell; orig: { x: number; y: number } }[];
  startX: number;
  width: number;
  weight: number;
  q: number; // sum of weight_i * (orig_x_i - sum_widths_before_i)
}

function clusterPlace(cluster: Cluster, rowMaxX: number): number {
  const xMin = 0;
  const xMax = rowMaxX - cluster.width;
  const optimal = cluster.q / cluster.weight;
  return Math.max(xMin, Math.min(xMax, optimal));
}

function addCellToCluster(cl: Cluster, cell: Cell, orig: { x: number; y: number }, weight = 1): void {
  // q update: when cell joins, its preferred x becomes (orig.x - widthBefore).
  const widthBefore = cl.width;
  cl.q += weight * (orig.x - widthBefore);
  cl.weight += weight;
  cl.width += cell.width;
  cl.cells.push({ cell, orig });
}

function mergeClusters(prev: Cluster, next: Cluster): Cluster {
  // Append next into prev, shifting next's q by prev's width.
  for (const { cell, orig } of next.cells) {
    addCellToCluster(prev, cell, orig);
  }
  return prev;
}

function placeCellInRow(row: Row & { clusters?: Cluster[] }, cell: Cell, rowMaxX: number): void {
  const orig = { x: cell.position!.x, y: cell.position!.y };
  const clusters = row.clusters ?? (row.clusters = []);

  // Start a new cluster with just this cell.
  let cur: Cluster = {
    cells: [{ cell, orig }],
    startX: 0,
    width: cell.width,
    weight: 1,
    q: orig.x,
  };

  // Merge backwards while the previous cluster overlaps us.
  while (clusters.length > 0) {
    const prev = clusters[clusters.length - 1];
    const prevX = clusterPlace(prev, rowMaxX);
    cur.startX = clusterPlace(cur, rowMaxX);
    if (prevX + prev.width <= cur.startX) break;
    clusters.pop();
    cur = mergeClusters(prev, cur);
  }
  cur.startX = clusterPlace(cur, rowMaxX);
  clusters.push(cur);
}

export function abacusLegalization(params: PlacementParams): PlacementResult {
  const start = performance.now();
  const seeded = seedPositions(params.cells, params.chipWidth, params.chipHeight);
  const rowHeight = Math.max(...seeded.map(c => c.height), 1);
  const rows: (Row & { clusters?: Cluster[] })[] = buildRows(
    params.chipWidth, params.chipHeight, rowHeight
  );

  // Sort by x (ascending) so each cell joins the rightmost cluster of a row.
  const order = seeded
    .map((c, i) => ({ c, i }))
    .sort((a, b) => a.c.position!.x - b.c.position!.x);

  // Assignment: try every row, pick the one that gives the smallest |dx|+|dy|
  // *after* that row's clusters are updated. We don't actually do a full
  // trial-and-rollback per row (that's the textbook version) — we
  // approximate by picking the row with the lowest current `nextX` for the
  // cell's preferred x band, which is what most production abacus variants
  // do for speed.
  for (const { c } of order) {
    let bestRow: (Row & { clusters?: Cluster[] }) | null = null;
    let bestCost = Infinity;
    for (const row of rows) {
      // Estimate cost = vertical shift + projected horizontal shift.
      const projectedX = Math.max(c.position!.x, row.nextX);
      const cost = Math.abs(projectedX - c.position!.x) + Math.abs(row.y - c.position!.y);
      if (cost < bestCost) { bestCost = cost; bestRow = row; }
    }
    if (!bestRow) bestRow = rows[0];
    placeCellInRow(bestRow, c, params.chipWidth);
    // Update row.nextX from cluster placement.
    const clusters = bestRow.clusters!;
    const last = clusters[clusters.length - 1];
    bestRow.nextX = clusterPlace(last, params.chipWidth) + last.width;
  }

  // Materialize cluster placements back onto cells.
  const placed: Cell[] = [];
  for (const row of rows) {
    if (!row.clusters) continue;
    for (const cl of row.clusters) {
      let x = clusterPlace(cl, params.chipWidth);
      for (const { cell } of cl.cells) {
        placed.push({ ...cell, position: { x, y: row.y } });
        x += cell.width;
      }
    }
  }

  const wl = totalWirelengthHPWL(placed, params.nets);
  return {
    success: true,
    cells: placed,
    totalWirelength: wl,
    overlap: 0,
    runtime: performance.now() - start,
    iterations: 1,
  };
}
