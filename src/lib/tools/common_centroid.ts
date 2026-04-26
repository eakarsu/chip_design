/**
 * Common-centroid layout generator (matched analog devices).
 *
 * Given M groups of identical unit devices (capacitors, transistors,
 * resistors), interdigitate them on a 2-D grid such that each group's
 * units have the same centroid as the array's geometric centre. This
 * cancels first-order linear gradients (process, mechanical stress,
 * temperature) across the array.
 *
 * Strategy: produce an N×N tile grid (N² ≥ total units, even), then
 * walk the grid in a snake pattern assigning groups in repeating
 * "ABBA" order. After placement, verify centroid drift per group and
 * report worst-case offset (in tile units).
 */
export interface CcSpec {
  /** Number of matched groups. */
  groups: number;
  /** Units per group (same for all groups). */
  unitsPerGroup: number;
  /** Tile width (μm). */
  tileWUm?: number;
  /** Tile height (μm). */
  tileHUm?: number;
}

export interface CcCell {
  row: number;
  col: number;
  group: number;
}

export interface CcResult {
  rows: number;
  cols: number;
  cells: CcCell[];
  /** Centroid of each group: x,y in tile coords. */
  centroids: { group: number; cx: number; cy: number }[];
  /** Array centroid. */
  arrayCx: number;
  arrayCy: number;
  /** Worst centroid offset (tiles). */
  maxOffset: number;
  notes: string[];
}

export function genCommonCentroid(spec: CcSpec): CcResult {
  if (spec.groups < 2) throw new Error('need at least 2 groups');
  if (spec.unitsPerGroup < 2) throw new Error('need at least 2 units per group');
  const total = spec.groups * spec.unitsPerGroup;
  // Pick smallest even side N s.t. N² ≥ total.
  let N = Math.ceil(Math.sqrt(total));
  if (N % 2) N += 1;
  const cells: CcCell[] = [];
  // Snake walk + ABBA assignment for 2-group case; for general M, use
  // mirrored quadrant fill: pos i ↔ pos N²-1-i must be the same group.
  const positions: { row: number; col: number }[] = [];
  for (let r = 0; r < N; r++) {
    if (r % 2 === 0) {
      for (let c = 0; c < N; c++) positions.push({ row: r, col: c });
    } else {
      for (let c = N - 1; c >= 0; c--) positions.push({ row: r, col: c });
    }
  }
  // For each pair (i, total_pairs - 1 - i) assign the same group, cycling.
  const assigned: number[] = new Array(N * N).fill(-1);
  let g = 0;
  let assignedThisGroup = 0;
  for (let i = 0; i < (N * N) / 2; i++) {
    const j = N * N - 1 - i;
    assigned[i] = g; assigned[j] = g;
    assignedThisGroup += 2;
    if (assignedThisGroup >= spec.unitsPerGroup) {
      g++; assignedThisGroup = 0;
      if (g >= spec.groups) g = -1; // remaining cells become "filler"
    }
  }
  positions.forEach((p, i) => {
    if (assigned[i] >= 0) cells.push({ ...p, group: assigned[i] });
  });
  // Compute centroids.
  const sums: { x: number; y: number; n: number }[] = Array.from(
    { length: spec.groups }, () => ({ x: 0, y: 0, n: 0 }),
  );
  for (const cell of cells) {
    sums[cell.group].x += cell.col;
    sums[cell.group].y += cell.row;
    sums[cell.group].n += 1;
  }
  const centroids = sums.map((s, i) => ({
    group: i, cx: s.x / Math.max(1, s.n), cy: s.y / Math.max(1, s.n),
  }));
  const arrayCx = (N - 1) / 2;
  const arrayCy = (N - 1) / 2;
  const maxOffset = Math.max(...centroids.map(c => Math.hypot(
    c.cx - arrayCx, c.cy - arrayCy,
  )));
  const notes: string[] = [];
  if (cells.length < total) {
    notes.push(`array undersized: only ${cells.length}/${total} units placed`);
  }
  if (maxOffset > 0.5) {
    notes.push(`large centroid drift ${maxOffset.toFixed(2)} tiles — increase array size`);
  }
  return { rows: N, cols: N, cells, centroids, arrayCx, arrayCy, maxOffset, notes };
}
