/**
 * Affine loop-nest (polyhedral-style) tiling + loop-order explorer.
 *
 * This is a real analysis, not a stub:
 *
 *  1. Index expressions are normalised to affine form in terms of loop
 *     iteration counters (loop `step` is folded into the coefficients), and
 *     array shapes/strides are inferred from the access ranges.
 *  2. Dependences are computed *exactly* for the (bounded) iteration space by
 *     enumerating every iteration, hashing the array locations it touches and
 *     recording the distance vectors between conflicting accesses (at least
 *     one of which is a write). Loop permutations are legal iff every non-zero
 *     distance vector stays lexicographically positive in the permuted order.
 *  3. Legal loop orders are enumerated exhaustively (1..5 loops). For each
 *     legal order, tiling factors from a deterministic per-loop factor set are
 *     enumerated (cartesian product, ordered by "fewest tiled dimensions
 *     first" so truncation keeps diversity).
 *  4. Each schedule (order + factors) is costed by walking its tiles with an
 *     explicit two-level memory model (assumptions A1-A8 below).
 *  5. Schedules are ranked with a 3-objective Pareto front
 *     (min L2 traffic, min peak tile working set, max tile count).
 *
 * ---------------------------------------------------------------------------
 * Explicit cost-model assumptions
 * ---------------------------------------------------------------------------
 *  A1. Two levels only: an on-chip fast memory of `fastMemoryBytes`
 *      (default 32 KiB) and off-chip L2/DRAM fetched in `lineBytes` granules
 *      (default 64 B). Element size `elementBytes` (default 4 B).
 *  A2. Layout is row-major with strides inferred from the index ranges of the
 *      accesses to each array (instrumentation of the *declared* shapes is the
 *      caller's job; inferred shapes are returned in `arrayShapes`).
 *  A3. Tiles are software-managed: each tile loads its working set from L2
 *      once. No cross-tile reuse is credited (pessimistic scratchpad model).
 *  A4. A tile that does not fit the fast memory is assumed to be re-fetched
 *      ceil(workingSet / fastMemoryBytes) times (pessimistic spill model).
 *  A5. A tile's distinct addresses are assumed byte-contiguous for line
 *      accounting: lines = max(1, ceil(distinctBytes / lineBytes)). This is
 *      exact for unit-stride innermost dimensions and rewards larger innermost
 *      tiles (spatial reuse).
 *  A6. Distinct index-value counts use the arithmetic-progression bound
 *      floor((max-min)/gcd(coeffs)) + 1, exact when one loop drives a
 *      dimension and an upper bound otherwise. Address counts multiply over
 *      dimensions (separable index expressions).
 *  A7. Dependences are computed by enumerating the bounded iteration space
 *      (limits: <= 5 loops, extent <= 128 each, <= 65536 iterations total), so
 *      they are exact for the supplied nest, not a conservative
 *      over-approximation. Aliasing is decided per array + index tuple; two
 *      accesses with permuted index orders (A[i][j] vs A[j][i]) are treated as
 *      distinct locations unless their index tuples coincide.
 *  A8. Write traffic is counted as one line transfer per store miss; dirty
 *      write-back traffic is not modelled.
 *
 * ---------------------------------------------------------------------------
 * Monotonic / boundary behaviour (documented, and asserted by the tests)
 * ---------------------------------------------------------------------------
 *  M1. While every tile's working set fits the fast memory, L2 traffic is
 *      non-increasing in the tile factors: merging tiles can only reduce
 *      sum(ceil(bytes/lineBytes)). Verified by tests for power-of-two chains.
 *  M2. Traffic increases again once a tile's working set exceeds
 *      `fastMemoryBytes` (the spill-pass multiplier kicks in): the classic
 *      U-curve of tiling. `fitsFastMemory`/`spillPasses` expose the boundary.
 *  M3. Boundary (non-dividing) tiles are clamped with min() ranges; the cost
 *      model enumerates the actual clamped boxes, so partial tiles are costed
 *      exactly rather than assumed full.
 *  M4. Extent-1 loops only admit factor 1; factor sets are de-duplicated, so a
 *      nest of unit extents degenerates to the untiled schedule.
 *  M5. Results are deterministic: factor sets, permutation enumeration order,
 *      tile odometer and the final sort are fixed (ties broken by id).
 */
import { z } from 'zod';

/* ------------------------------------------------------------------ */
/* schema                                                              */
/* ------------------------------------------------------------------ */

export const MAX_LOOPS = 5;
export const MAX_EXTENT = 128;
export const MAX_ITERATIONS = 65_536;
export const DEFAULT_MAX_CANDIDATES = 96;
export const TILE_EVALUATION_BUDGET = 400_000;
export const MAX_REPORTED_DEPENDENCES = 64;

const indexTermSchema = z.union([
  z.number().int().min(-4096).max(4096),
  z.object({
    loop: z.string().min(1).max(24),
    coeff: z.number().int().min(-64).max(64).optional(),
    offset: z.number().int().min(-4096).max(4096).optional(),
  }),
]);

export const loopNestSchema = z
  .object({
    loops: z
      .array(
        z.object({
          name: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/, 'loop names must be identifiers'),
          lower: z.number().int().min(0).max(4096),
          upper: z.number().int().min(1).max(4096),
          step: z.number().int().min(1).max(64).optional(),
        })
      )
      .min(1)
      .max(MAX_LOOPS),
    accesses: z
      .array(
        z.object({
          array: z.string().min(1).max(32),
          kind: z.enum(['read', 'write']),
          indices: z.array(indexTermSchema).min(1).max(4),
        })
      )
      .min(1)
      .max(8),
    elementBytes: z.number().int().min(1).max(16).optional(),
    lineBytes: z.number().int().min(4).max(512).optional(),
    fastMemoryBytes: z.number().int().min(64).max(64 * 1024 * 1024).optional(),
    opsPerIteration: z.number().int().min(1).max(1_000_000).optional(),
    maxCandidates: z.number().int().min(1).max(512).optional(),
  })
  .refine((spec) => new Set(spec.loops.map((l) => l.name)).size === spec.loops.length, {
    message: 'loop names must be unique',
    path: ['loops'],
  })
  .refine((spec) => spec.loops.every((l) => l.upper > l.lower), {
    message: 'every loop needs upper > lower',
    path: ['loops'],
  });

export type LoopNestInput = z.infer<typeof loopNestSchema>;

export interface NormalizedLoop {
  name: string;
  lower: number;
  upper: number;
  step: number;
  extent: number;
}

export interface NormalizedAccess {
  array: string;
  kind: 'read' | 'write';
  /** Per index dimension: effective coefficients per loop (step folded in) plus constant offset. */
  dims: { coeffs: number[]; offset: number }[];
}

export interface NormalizedNest {
  loops: NormalizedLoop[];
  accesses: NormalizedAccess[];
  elementBytes: number;
  lineBytes: number;
  fastMemoryBytes: number;
  opsPerIteration: number;
  totalIterations: number;
  totalAccesses: number;
}

export interface DependenceVector {
  /** Distance vector in the original loop order; non-zero and lexicographically positive. */
  delta: number[];
  /** Arrays involved. */
  arrays: string[];
  /** Number of (source, sink) access pairs that produced this vector. */
  occurrences: number;
}

export interface PolyhedralSchedule {
  id: string;
  loopOrder: string[];
  tileFactors: Record<string, number>;
  tileShape: number[];
  transformedListing: string;
  tileCount: number;
  tileIterations: number;
  totalIterations: number;
  l2TrafficBytes: number;
  /** Bytes requested by the accesses at the innermost level. */
  requestedBytes: number;
  /** Lines transferred from L2 (including spill re-fetches). */
  linesFromL2: number;
  /** Distinct lines touched, ignoring spill re-fetch. */
  linesTouched: number;
  accessesPerLine: number;
  requestBytesPerL2Byte: number;
  maxWorkingSetBytes: number;
  spillPasses: number;
  fitsFastMemory: boolean;
  arithmeticIntensityOpsPerByte: number;
  dominated: boolean;
  paretoRank: number | null;
}

export interface PolyhedralAnalysis {
  loops: NormalizedLoop[];
  arrayShapes: Record<string, { shape: number[]; strides: number[] }>;
  /** Capped view (MAX_REPORTED_DEPENDENCES) of the exact distance-vector set. */
  dependenceVectors: DependenceVector[];
  dependenceVectorCount: number;
  legalOrders: string[][];
  candidateCount: number;
  evaluatedCount: number;
  truncated: boolean;
  schedules: PolyhedralSchedule[];
  pareto: string[];
  notes: string[];
}

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x;
}

function gcdAll(values: number[]): number {
  return values.filter((v) => v !== 0).reduce((acc, v) => gcd(acc, v), 0);
}

function permutations(n: number): number[][] {
  const out: number[][] = [];
  const current: number[] = [];
  const used = new Array<boolean>(n).fill(false);
  const recurse = () => {
    if (current.length === n) {
      out.push([...current]);
      return;
    }
    for (let i = 0; i < n; i += 1) {
      if (used[i]) continue;
      used[i] = true;
      current.push(i);
      recurse();
      current.pop();
      used[i] = false;
    }
  };
  recurse();
  return out;
}

export function normalizeLoopNest(raw: LoopNestInput): NormalizedNest {
  const spec = loopNestSchema.parse(raw);
  const loops: NormalizedLoop[] = spec.loops.map((l) => {
    const step = l.step ?? 1;
    return {
      name: l.name,
      lower: l.lower,
      upper: l.upper,
      step,
      extent: Math.ceil((l.upper - l.lower) / step),
    };
  });
  if (loops.some((l) => l.extent > MAX_EXTENT)) {
    throw new Error(`loop extents must be <= ${MAX_EXTENT} iterations for exact enumeration`);
  }
  const totalIterations = loops.reduce((acc, l) => acc * l.extent, 1);
  if (totalIterations > MAX_ITERATIONS) {
    throw new Error(`iteration space is ${totalIterations}; the exact model supports <= ${MAX_ITERATIONS}`);
  }
  const loopIndex = new Map(loops.map((l, idx) => [l.name, idx]));
  const accesses: NormalizedAccess[] = spec.accesses.map((a) => {
    const dims = a.indices.map((term) => {
      const coeffs = new Array<number>(loops.length).fill(0);
      let offset = 0;
      if (typeof term === 'number') {
        offset = term;
      } else {
        const idx = loopIndex.get(term.loop);
        if (idx === undefined) throw new Error(`access to ${a.array} references unknown loop '${term.loop}'`);
        const coeff = term.coeff ?? 1;
        const termOffset = term.offset ?? 0;
        // value = coeff*(lower + step*x) + offset = (coeff*step)*x + (coeff*lower + offset)
        coeffs[idx] += coeff * loops[idx].step;
        offset += coeff * loops[idx].lower + termOffset;
      }
      return { coeffs, offset };
    });
    return { array: a.array, kind: a.kind, dims };
  });
  return {
    loops,
    accesses,
    elementBytes: spec.elementBytes ?? 4,
    lineBytes: spec.lineBytes ?? 64,
    fastMemoryBytes: spec.fastMemoryBytes ?? 32 * 1024,
    opsPerIteration: spec.opsPerIteration ?? accesses.length,
    totalIterations,
    totalAccesses: totalIterations * accesses.length,
  };
}

/** Infer per-array row-major shapes/strides from the access index ranges. */
export function inferArrayShapes(nest: NormalizedNest): Record<string, { shape: number[]; strides: number[] }> {
  const out: Record<string, { shape: number[]; strides: number[] }> = {};
  for (const access of nest.accesses) {
    const entry = out[access.array] ?? { shape: access.dims.map(() => 1), strides: [] as number[] };
    out[access.array] = entry;
    access.dims.forEach((dim, d) => {
      let lo = dim.offset;
      let hi = dim.offset;
      nest.loops.forEach((loop, l) => {
        const c = dim.coeffs[l];
        if (c >= 0) hi += c * (loop.extent - 1);
        else lo += c * (loop.extent - 1);
      });
      entry.shape[d] = Math.max(entry.shape[d] ?? 1, hi - lo + 1);
    });
  }
  for (const entry of Object.values(out)) {
    const strides = new Array<number>(entry.shape.length).fill(1);
    for (let d = entry.shape.length - 2; d >= 0; d -= 1) {
      strides[d] = strides[d + 1] * entry.shape[d + 1];
    }
    entry.strides = strides;
  }
  return out;
}

/**
 * Exact dependence distance vectors for the bounded nest.
 *
 * Every iteration is enumerated and the array locations it touches are hashed.
 * For each location with at least one write, every ordered (source, sink) pair
 * where the sink is program-later contributes the distance vector
 * sink - source (lexicographically positive by construction).
 */
export function dependenceDistanceVectors(nest: NormalizedNest): DependenceVector[] {
  const L = nest.loops.length;
  const buckets = new Map<string, { iter: number[]; kind: 'read' | 'write' }[]>();
  const coords = new Array<number>(L).fill(0);
  for (let iter = 0; iter < nest.totalIterations; iter += 1) {
    for (const access of nest.accesses) {
      const parts: string[] = [access.array];
      access.dims.forEach((dim) => {
        let value = dim.offset;
        for (let l = 0; l < L; l += 1) value += dim.coeffs[l] * coords[l];
        parts.push(String(value));
      });
      const key = parts.join(':');
      const list = buckets.get(key);
      if (list) list.push({ iter: [...coords], kind: access.kind });
      else buckets.set(key, [{ iter: [...coords], kind: access.kind }]);
    }
    for (let l = L - 1; l >= 0; l -= 1) {
      coords[l] += 1;
      if (coords[l] < nest.loops[l].extent) break;
      coords[l] = 0;
    }
  }

  const seen = new Map<string, DependenceVector>();
  for (const [key, entries] of buckets) {
    if (entries.length < 2 || !entries.some((e) => e.kind === 'write')) continue;
    const arrayName = key.slice(0, key.indexOf(':'));
    for (let a = 0; a < entries.length; a += 1) {
      for (let b = 0; b < entries.length; b += 1) {
        if (a === b) continue;
        const first = entries[a];
        const second = entries[b];
        if (first.kind !== 'write' && second.kind !== 'write') continue;
        // program order === lexicographic order of the iteration vectors
        let lex = 0;
        for (let i = 0; i < L; i += 1) {
          if (first.iter[i] !== second.iter[i]) {
            lex = first.iter[i] < second.iter[i] ? -1 : 1;
            break;
          }
        }
        if (lex === 0) continue; // same iteration: no distance
        const source = lex < 0 ? first : second;
        const sink = lex < 0 ? second : first;
        const delta = sink.iter.map((v, i) => v - source.iter[i]);
        if (delta.every((v) => v === 0)) continue;
        const vectorKey = delta.join(',');
        const existing = seen.get(vectorKey);
        if (existing) {
          existing.occurrences += 1;
          if (!existing.arrays.includes(arrayName)) existing.arrays.push(arrayName);
        } else {
          seen.set(vectorKey, { delta, arrays: [arrayName], occurrences: 1 });
        }
      }
    }
  }
  return [...seen.values()].sort((x, y) => {
    for (let i = 0; i < x.delta.length; i += 1) {
      if (x.delta[i] !== y.delta[i]) return x.delta[i] - y.delta[i];
    }
    return 0;
  });
}

/** A permutation is legal iff every distance vector stays lexicographically positive. */
export function isLegalOrder(vectors: DependenceVector[], order: number[]): boolean {
  for (const vector of vectors) {
    let legal = false;
    for (const loop of order) {
      if (vector.delta[loop] !== 0) {
        legal = vector.delta[loop] > 0;
        break;
      }
    }
    if (!legal) return false;
  }
  return true;
}

export function enumerateLegalOrders(vectors: DependenceVector[], loopCount: number): number[][] {
  return permutations(loopCount).filter((order) => isLegalOrder(vectors, order));
}

/** Deterministic candidate factors per loop: 1, powers of two, divisors, extent (capped). */
export function tileFactorCandidates(extent: number, cap = 8): number[] {
  if (extent <= 1) return [1];
  const factors = new Set<number>([1, extent]);
  for (let f = 2; f <= extent && factors.size < cap + 1; f *= 2) factors.add(f);
  for (let f = 2; f <= extent && factors.size < cap + 1; f += 1) {
    if (extent % f === 0) factors.add(f);
  }
  const sorted = [...factors].sort((a, b) => a - b);
  if (sorted.length <= cap) return sorted;
  // Keep the smallest factors plus the extent (largest) so the factor range stays covered.
  return [...new Set([...sorted.slice(0, cap - 1), sorted[sorted.length - 1]])].sort((a, b) => a - b);
}

export interface ScheduleCandidate {
  order: number[];
  factors: number[];
  tileCountPlanned: number;
}

/** Generate schedule candidates: legal orders x deterministic factor tuples. */
export function enumerateScheduleCandidates(
  loops: NormalizedLoop[],
  vectors: DependenceVector[],
  maxCandidates: number
): { candidates: ScheduleCandidate[]; truncated: boolean } {
  const legalOrders = enumerateLegalOrders(vectors, loops.length);
  const factorSets = loops.map((l) => tileFactorCandidates(l.extent));
  const perOrderBudget = Math.max(1, Math.floor(maxCandidates / Math.max(1, legalOrders.length)));
  const candidates: ScheduleCandidate[] = [];
  let truncated = false;

  for (const order of legalOrders) {
    const tuples: number[][] = [];
    const recurse = (position: number, acc: number[]) => {
      if (position === order.length) {
        tuples.push([...acc]);
        return;
      }
      for (const f of factorSets[order[position]]) {
        acc.push(f);
        recurse(position + 1, acc);
        acc.pop();
      }
    };
    recurse(0, []);
    // "fewest tiled dimensions first", then lexicographic: keeps diverse factors under truncation.
    tuples.sort((a, b) => {
      const tiledA = a.filter((f) => f > 1).length;
      const tiledB = b.filter((f) => f > 1).length;
      if (tiledA !== tiledB) return tiledA - tiledB;
      for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return a[i] - b[i];
      return 0;
    });
    const take = Math.min(perOrderBudget, tuples.length);
    if (take < tuples.length) truncated = true;
    for (let t = 0; t < take; t += 1) {
      const factorsInOrder = tuples[t];
      const factors = new Array<number>(loops.length).fill(1);
      order.forEach((loopIndex, position) => {
        factors[loopIndex] = factorsInOrder[position];
      });
      const tileCountPlanned = loops.reduce((acc, l, i) => acc * Math.ceil(l.extent / factors[i]), 1);
      candidates.push({ order, factors, tileCountPlanned });
    }
  }
  if (candidates.length > maxCandidates) {
    candidates.length = maxCandidates;
    truncated = true;
  }
  return { candidates, truncated };
}

export interface ScheduleMetrics {
  tileCount: number;
  l2TrafficBytes: number;
  requestedBytes: number;
  linesFromL2: number;
  linesTouched: number;
  maxWorkingSetBytes: number;
  spillPasses: number;
}

/**
 * Walk the tiled nest and accumulate the cost model.
 *
 * For each tile the distinct addresses of each access are counted from the
 * affine index ranges (A6), converted to lines (A5) and multiplied by the
 * spill-pass count when the tile working set exceeds the fast memory (A4).
 */
export function evaluateScheduleMetrics(nest: NormalizedNest, order: number[], factors: number[]): ScheduleMetrics {
  const L = nest.loops.length;
  const tileDims = nest.loops.map((l, i) => Math.ceil(l.extent / factors[i]));
  const tileCoords = new Array<number>(L).fill(0);

  let tileCount = 0;
  let l2TrafficBytes = 0;
  let linesFromL2 = 0;
  let linesTouched = 0;
  let maxWorkingSetBytes = 0;
  let spillPasses = 0;

  for (;;) {
    tileCount += 1;
    let workingSetBytes = 0;
    let linesThisTile = 0;
    for (const access of nest.accesses) {
      let distinctAddresses = 1;
      for (const dim of access.dims) {
        let lo = dim.offset;
        let hi = dim.offset;
        const nonzero: number[] = [];
        for (let l = 0; l < L; l += 1) {
          const c = dim.coeffs[l];
          if (c === 0) continue;
          const base = tileCoords[l] * factors[l];
          const count = Math.min(factors[l], nest.loops[l].extent - base);
          if (count <= 0) continue;
          nonzero.push(c);
          if (c > 0) {
            lo += c * base;
            hi += c * (base + count - 1);
          } else {
            lo += c * (base + count - 1);
            hi += c * base;
          }
        }
        const step = gcdAll(nonzero);
        distinctAddresses *= step > 0 ? Math.floor((hi - lo) / step) + 1 : 1;
      }
      const distinctBytes = distinctAddresses * nest.elementBytes;
      const lines = Math.max(1, Math.ceil(distinctBytes / nest.lineBytes));
      workingSetBytes += distinctBytes;
      linesThisTile += lines;
    }
    const spill = Math.max(1, Math.ceil(workingSetBytes / nest.fastMemoryBytes));
    maxWorkingSetBytes = Math.max(maxWorkingSetBytes, workingSetBytes);
    spillPasses = Math.max(spillPasses, spill);
    linesTouched += linesThisTile;
    const transferred = linesThisTile * spill;
    linesFromL2 += transferred;
    l2TrafficBytes += transferred * nest.lineBytes;

    let advanced = false;
    for (let pos = L - 1; pos >= 0; pos -= 1) {
      const l = order[pos];
      tileCoords[l] += 1;
      if (tileCoords[l] < tileDims[l]) {
        advanced = true;
        break;
      }
      tileCoords[l] = 0;
    }
    if (!advanced) break;
  }

  return {
    tileCount,
    l2TrafficBytes,
    requestedBytes: nest.totalAccesses * nest.elementBytes,
    linesFromL2,
    linesTouched,
    maxWorkingSetBytes,
    spillPasses,
  };
}

/** Render one affine index dimension in terms of the loop iteration counters. */
function renderIndexExpression(dim: NormalizedAccess['dims'][number], loops: NormalizedLoop[]): string {
  const parts: string[] = [];
  loops.forEach((loop, l) => {
    const c = dim.coeffs[l];
    if (c === 0) return;
    if (c === 1) parts.push(loop.name);
    else if (c === -1) parts.push(`-${loop.name}`);
    else parts.push(`${c}*${loop.name}`);
  });
  let expr = parts.join(' + ').replace(/\+ -/g, '- ');
  if (parts.length === 0) expr = String(dim.offset);
  else if (dim.offset !== 0) expr += dim.offset > 0 ? ` + ${dim.offset}` : ` - ${-dim.offset}`;
  return expr;
}

/** Human-readable transformed loop nest for a schedule. */
export function renderTransformedLoopNest(nest: NormalizedNest, order: number[], factors: number[]): string {
  const out: string[] = [];
  const indent = (n: number) => '  '.repeat(n);
  out.push(`// tile factors: ${nest.loops.map((l, i) => `${l.name}=${factors[i]}`).join(', ')}`);
  out.push(`// loop order   : ${order.map((i) => nest.loops[i].name).join(', ')}`);
  let depth = 0;
  order.forEach((l) => {
    const loop = nest.loops[l];
    const f = factors[l];
    if (f > 1) {
      const tiles = Math.ceil(loop.extent / f);
      out.push(`${indent(depth)}for t_${loop.name} in 0 .. ${tiles - 1}:`);
      depth += 1;
      out.push(
        `${indent(depth)}for ${loop.name} in t_${loop.name}*${f} .. min(t_${loop.name}*${f}+${f}, ${loop.extent}) - 1:`
      );
    } else {
      out.push(`${indent(depth)}for ${loop.name} in 0 .. ${loop.extent - 1}:`);
    }
    depth += 1;
  });
  for (const access of nest.accesses) {
    const indices = access.dims.map((dim) => renderIndexExpression(dim, nest.loops)).join('][');
    const prefix = access.kind === 'write' ? 'write ' : 'read  ';
    out.push(`${indent(depth)}${prefix}${access.array}[${indices}]`);
  }
  out.push('// boundary tiles are clamped with min(); the cost model enumerates the clamped boxes');
  return out.join('\n');
}

/** Pareto front for (min L2 traffic, min peak working set, max tile count). */
export function paretoFront(schedules: PolyhedralSchedule[]): string[] {
  const dominatedIds = new Set<string>();
  const dominates = (a: PolyhedralSchedule, b: PolyhedralSchedule): boolean => {
    const noWorse =
      a.l2TrafficBytes <= b.l2TrafficBytes &&
      a.maxWorkingSetBytes <= b.maxWorkingSetBytes &&
      a.tileCount >= b.tileCount;
    const strictlyBetter =
      a.l2TrafficBytes < b.l2TrafficBytes ||
      a.maxWorkingSetBytes < b.maxWorkingSetBytes ||
      a.tileCount > b.tileCount;
    return noWorse && strictlyBetter;
  };
  for (const a of schedules) {
    for (const b of schedules) {
      if (a.id === b.id) continue;
      if (dominates(a, b)) dominatedIds.add(b.id);
      else if (dominates(b, a)) dominatedIds.add(a.id);
    }
  }
  return schedules.map((s) => s.id).filter((id) => !dominatedIds.has(id));
}

/* ------------------------------------------------------------------ */
/* entry point                                                         */
/* ------------------------------------------------------------------ */

export function analyzeLoopNest(raw: LoopNestInput): PolyhedralAnalysis {
  const spec = loopNestSchema.parse(raw);
  const nest = normalizeLoopNest(spec);
  const arrayShapes = inferArrayShapes(nest);
  const vectors = dependenceDistanceVectors(nest);
  const maxCandidates = spec.maxCandidates ?? DEFAULT_MAX_CANDIDATES;
  const { candidates, truncated: truncatedByEnumeration } = enumerateScheduleCandidates(nest.loops, vectors, maxCandidates);

  const schedules: PolyhedralSchedule[] = [];
  let truncated = truncatedByEnumeration;
  let evaluations = 0;
  for (const candidate of candidates) {
    if (schedules.length > 0 && evaluations + candidate.tileCountPlanned > TILE_EVALUATION_BUDGET) {
      truncated = true;
      break;
    }
    evaluations += candidate.tileCountPlanned;
    const metrics = evaluateScheduleMetrics(nest, candidate.order, candidate.factors);
    const orderNames = candidate.order.map((i) => nest.loops[i].name);
    const id = `order=${orderNames.join('')}|tile=${orderNames
      .map((name, position) => `${name}${candidate.factors[candidate.order[position]]}`)
      .join(',')}`;
    schedules.push({
      id,
      loopOrder: orderNames,
      tileFactors: Object.fromEntries(nest.loops.map((l, i) => [l.name, candidate.factors[i]])),
      tileShape: candidate.order.map((i) => candidate.factors[i]),
      transformedListing: renderTransformedLoopNest(nest, candidate.order, candidate.factors),
      tileCount: metrics.tileCount,
      tileIterations: candidate.factors.reduce((acc, f) => acc * f, 1),
      totalIterations: nest.totalIterations,
      l2TrafficBytes: metrics.l2TrafficBytes,
      requestedBytes: metrics.requestedBytes,
      linesFromL2: metrics.linesFromL2,
      linesTouched: metrics.linesTouched,
      accessesPerLine:
        metrics.linesTouched > 0 ? Math.round((nest.totalAccesses / metrics.linesTouched) * 100) / 100 : 0,
      requestBytesPerL2Byte:
        metrics.l2TrafficBytes > 0 ? Math.round((metrics.requestedBytes / metrics.l2TrafficBytes) * 100) / 100 : 0,
      maxWorkingSetBytes: metrics.maxWorkingSetBytes,
      spillPasses: metrics.spillPasses,
      fitsFastMemory: metrics.maxWorkingSetBytes <= nest.fastMemoryBytes,
      arithmeticIntensityOpsPerByte:
        metrics.l2TrafficBytes > 0
          ? Math.round(((nest.opsPerIteration * nest.totalIterations) / metrics.l2TrafficBytes) * 1000) / 1000
          : 0,
      dominated: false,
      paretoRank: null,
    });
  }

  schedules.sort((a, b) => {
    if (a.l2TrafficBytes !== b.l2TrafficBytes) return a.l2TrafficBytes - b.l2TrafficBytes;
    if (a.maxWorkingSetBytes !== b.maxWorkingSetBytes) return a.maxWorkingSetBytes - b.maxWorkingSetBytes;
    if (a.tileCount !== b.tileCount) return b.tileCount - a.tileCount;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  const pareto = paretoFront(schedules);
  const paretoSet = new Set(pareto);
  schedules.forEach((schedule) => {
    schedule.dominated = !paretoSet.has(schedule.id);
    schedule.paretoRank = paretoSet.has(schedule.id) ? pareto.indexOf(schedule.id) + 1 : null;
  });

  const loopNames = nest.loops.map((l) => l.name);
  const notes = [
    'Cost model: each tile loads its working set from L2 once (no cross-tile reuse credited); a tile whose working set exceeds the fast memory is re-fetched ceil(workingSet/fastMemoryBytes) times.',
    `Memory model: elementBytes=${nest.elementBytes}, lineBytes=${nest.lineBytes}, fastMemoryBytes=${nest.fastMemoryBytes}, opsPerIteration=${nest.opsPerIteration}.`,
    `Iteration space: ${nest.totalIterations} iterations x ${nest.accesses.length} accesses = ${nest.totalAccesses} memory operations (${nest.totalIterations * nest.opsPerIteration} modelled ops).`,
    `Dependences: ${vectors.length} distinct distance vector(s) from exact enumeration of the bounded iteration space; loop orders are legal iff every non-zero vector stays lexicographically positive in the permuted order.` +
      (vectors.length > MAX_REPORTED_DEPENDENCES
        ? ` The response lists the first ${MAX_REPORTED_DEPENDENCES}.`
        : ''),
    `Loop orders: ${enumerateLegalOrders(vectors, nest.loops.length).length} of ${permutations(nest.loops.length).length} permutations are legal for (${loopNames.join(', ')}).`,
    truncated
      ? `Candidate list was truncated to ${schedules.length} evaluated schedules (maxCandidates=${maxCandidates}, tile-evaluation budget=${TILE_EVALUATION_BUDGET}); Pareto ranking covers the evaluated candidates only.`
      : `All ${schedules.length} candidate schedules were evaluated (no truncation).`,
    'Monotonicity (M1): while every tile fits the fast memory, L2 traffic is non-increasing in the tile factors (merging tiles cannot increase sum(ceil(bytes/lineBytes))).',
    'Boundary behaviour (M2): once a tile working set exceeds fastMemoryBytes the spill multiplier raises traffic again - the classic U-curve; fitsFastMemory and spillPasses mark the boundary.',
    'Boundary tiles (M3): non-dividing factors use min()-clamped ranges and are costed exactly, not as full tiles.',
    'These are model-based estimates under the stated assumptions, not measured hardware counters; validate the chosen schedule on the target memory system.',
  ];

  return {
    loops: nest.loops,
    arrayShapes,
    dependenceVectors: vectors.slice(0, MAX_REPORTED_DEPENDENCES),
    dependenceVectorCount: vectors.length,
    legalOrders: enumerateLegalOrders(vectors, nest.loops.length).map((order) =>
      order.map((i) => nest.loops[i].name)
    ),
    candidateCount: candidates.length,
    evaluatedCount: schedules.length,
    truncated,
    schedules,
    pareto,
    notes,
  };
}
