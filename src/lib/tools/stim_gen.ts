/**
 * Constrained-random stimulus generator.
 *
 * Each field has a name, a width in bits, and an optional list of
 * weighted ranges (`{ min, max, weight }`) — like SystemVerilog
 * `dist {}`. We pick a range proportional to weight, then a uniform
 * value within that range. Cross-field constraints are expressed as
 * predicates; we apply rejection sampling with a configurable cap.
 *
 * Returns the generated vectors plus a histogram per field for the UI.
 */
export interface StimRange {
  min: number;
  max: number;
  weight: number;
}

export interface StimField {
  name: string;
  /** Bit-width — sets default range [0, 2^width − 1] when no `dist`. */
  width: number;
  dist?: StimRange[];
}

export interface StimSpec {
  fields: StimField[];
  /** Number of vectors to draw. */
  vectors: number;
  /** Max retries per vector before giving up on the constraint. */
  maxRetries?: number;
  /** PRNG seed. */
  seed?: number;
  /** Cross-field predicate: must return true to accept. */
  constraint?: (v: Record<string, number>) => boolean;
}

export interface StimResult {
  vectors: Record<string, number>[];
  rejected: number;
  /** Per-field histogram with 16 buckets across observed range. */
  histograms: { field: string; min: number; max: number; counts: number[] }[];
}

export function generateStim(spec: StimSpec): StimResult {
  if (spec.vectors < 1) throw new Error('vectors must be >= 1');
  const maxRetries = spec.maxRetries ?? 16;
  let s = (spec.seed ?? 1) >>> 0;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0xffffffff; };
  const constraint = spec.constraint ?? (() => true);
  const draws: Record<string, number>[] = [];
  let rejected = 0;
  for (let v = 0; v < spec.vectors; v++) {
    let accepted: Record<string, number> | null = null;
    for (let r = 0; r < maxRetries && !accepted; r++) {
      const draw: Record<string, number> = {};
      for (const f of spec.fields) {
        if (f.dist && f.dist.length) {
          const totalW = f.dist.reduce((a, b) => a + b.weight, 0);
          if (totalW <= 0) throw new Error(`field ${f.name}: zero total weight`);
          let pick = rnd() * totalW;
          let chosen = f.dist[0];
          for (const range of f.dist) {
            pick -= range.weight;
            if (pick <= 0) { chosen = range; break; }
          }
          draw[f.name] = chosen.min + Math.floor(rnd() * (chosen.max - chosen.min + 1));
        } else {
          const max = (1 << Math.min(f.width, 30)) - 1;
          draw[f.name] = Math.floor(rnd() * (max + 1));
        }
      }
      if (constraint(draw)) accepted = draw;
      else rejected++;
    }
    if (!accepted) throw new Error('constraint unsatisfiable within maxRetries');
    draws.push(accepted);
  }
  const histograms = spec.fields.map(f => {
    const vals = draws.map(d => d[f.name]);
    const min = Math.min(...vals), max = Math.max(...vals);
    const counts = new Array<number>(16).fill(0);
    const span = max - min || 1;
    for (const v of vals) {
      const bucket = Math.min(15, Math.floor(((v - min) / span) * 16));
      counts[bucket]++;
    }
    return { field: f.name, min, max, counts };
  });
  return { vectors: draws, rejected, histograms };
}
