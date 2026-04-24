/**
 * Online RL retraining pipeline — TypeScript collector side.
 *
 * The TS side collects (state, action, reward, nextState) transitions into
 * a ring buffer, persists them to the `algorithm_runs` table, and exposes
 * a sampler the Python trainer consumes. The trainer itself lives in
 * `python_backend/rl_trainer.py`.
 *
 * Design decisions:
 *   - Ring buffer in memory, flushed to DB in batches (bufferSize or every
 *     `flushIntervalMs`). Each flush is a single SQLite transaction.
 *   - A transition is (stateHash, stateJson, action, reward, nextStateHash,
 *     metadata). stateHash lets the trainer dedupe identical states across
 *     runs so we don't overweight a stuck policy.
 *   - The sampler returns a uniform or prioritized batch — prioritized uses
 *     |TD-error| ∝ |reward − value_estimate|, stored per-transition.
 *
 * The Python trainer polls `GET /api/rl/sample?batch=64` when available
 * (UI wires that up in a follow-up), or reads directly from the DB.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { algorithmRuns } from '@/lib/db';

export interface Transition {
  id: string;
  designId?: string;
  userId?: string;
  /** Category e.g. 'placement'. Used to partition the replay buffer. */
  category: string;
  /** Algorithm chosen (the "action"). */
  action: string;
  /** Hyperparameters that went with the action. */
  parameters: Record<string, unknown>;
  /** Serialized state fingerprint (often the DesignSnapshot hash). */
  stateHash: string;
  /** Compact state features — same shape the Python model consumes. */
  stateFeatures?: Record<string, number>;
  /** Scalar reward (we use higher-is-better: negative runtime, negative HPWL, ...). */
  reward: number;
  /** Optional priority for prioritized replay. Default 1. */
  priority?: number;
  createdAt?: string;
}

export interface ReplayBufferOptions {
  /** Max transitions held in memory before forcing a flush. */
  flushThreshold?: number;
  /** Disables the DB flush — useful for unit tests. */
  persistent?: boolean;
}

/**
 * Bounded FIFO ring buffer. Persists to `algorithm_runs` on flush so the
 * trainer can read a larger-than-memory history.
 */
export class ReplayBuffer {
  private mem: Transition[] = [];
  private readonly threshold: number;
  private readonly persistent: boolean;

  constructor(opts: ReplayBufferOptions = {}) {
    this.threshold = opts.flushThreshold ?? 128;
    this.persistent = opts.persistent ?? true;
  }

  push(t: Transition): void {
    this.mem.push(t);
    if (this.mem.length >= this.threshold) this.flush();
  }

  size(): number { return this.mem.length; }

  /** Uniform-random batch from the in-memory buffer. */
  sampleUniform(n: number, rng: () => number = Math.random): Transition[] {
    if (this.mem.length === 0) return [];
    const k = Math.min(n, this.mem.length);
    const out: Transition[] = [];
    const idxs = new Set<number>();
    while (idxs.size < k) idxs.add(Math.floor(rng() * this.mem.length));
    for (const i of idxs) out.push(this.mem[i]);
    return out;
  }

  /**
   * Priority-weighted sampling. Probability ∝ priorityᵅ.
   * α=0 → uniform, α=1 → strictly proportional.
   */
  samplePrioritized(n: number, alpha = 0.6, rng: () => number = Math.random): Transition[] {
    if (this.mem.length === 0) return [];
    const weights = this.mem.map(t => Math.max(1e-6, (t.priority ?? 1)) ** alpha);
    const total = weights.reduce((a, b) => a + b, 0);
    const out: Transition[] = [];
    for (let i = 0; i < Math.min(n, this.mem.length); i++) {
      let r = rng() * total;
      for (let j = 0; j < this.mem.length; j++) {
        r -= weights[j];
        if (r <= 0) { out.push(this.mem[j]); break; }
      }
    }
    return out;
  }

  /** Flush all in-memory transitions to the DB and clear the buffer. */
  flush(): number {
    if (!this.persistent || this.mem.length === 0) {
      const n = this.mem.length;
      this.mem = [];
      return n;
    }
    const n = this.mem.length;
    for (const t of this.mem) {
      algorithmRuns.create({
        id: t.id,
        designId: t.designId,
        userId: t.userId,
        category: t.category,
        algorithm: t.action,
        parameters: t.parameters,
        result: {
          stateHash: t.stateHash,
          stateFeatures: t.stateFeatures ?? {},
          reward: t.reward,
          priority: t.priority ?? 1,
        },
        runtimeMs: 0,
        success: true,
      });
    }
    this.mem = [];
    return n;
  }

  /**
   * Load historical transitions from the DB to warm-start the buffer.
   * Useful after a server restart. Returns the number of rows loaded.
   */
  hydrateFromDb(filter?: { category?: string; limit?: number }): number {
    const all = algorithmRuns.list();
    const filtered = all.filter(r =>
      !filter?.category || r.category === filter.category
    );
    const limit = filter?.limit ?? this.threshold;
    const slice = filtered.slice(-limit);
    for (const r of slice) {
      this.mem.push({
        id: r.id,
        designId: r.designId,
        userId: r.userId,
        category: r.category,
        action: r.algorithm,
        parameters: r.parameters,
        stateHash: (r.result as any).stateHash ?? '',
        stateFeatures: (r.result as any).stateFeatures,
        reward: (r.result as any).reward ?? 0,
        priority: (r.result as any).priority ?? 1,
        createdAt: r.createdAt,
      });
    }
    return slice.length;
  }

  /** Snapshot of the in-memory buffer — for debugging. */
  peek(): Transition[] { return [...this.mem]; }
}

/* --------------------------------------------------------------------- */
/* Helpers used by the algorithm runners to produce rewards               */
/* --------------------------------------------------------------------- */

/**
 * Convert a placement result into a reward signal. Higher reward = better
 * outcome. The trainer's policy network consumes this directly.
 *
 *   r = − α·HPWL − β·overlap − γ·runtime_ms
 */
export function placementReward(opts: {
  hpwl: number;
  overlap: number;
  runtimeMs: number;
  weights?: { wl?: number; density?: number; runtime?: number };
}): number {
  const w = opts.weights ?? {};
  const aWl = w.wl ?? 1e-3;
  const aOv = w.density ?? 1e-2;
  const aRt = w.runtime ?? 1e-4;
  return -(aWl * opts.hpwl + aOv * opts.overlap + aRt * opts.runtimeMs);
}

/** Same shape for routing: − wirelength − via_count weighted. */
export function routingReward(opts: {
  wirelength: number;
  viaCount: number;
  runtimeMs: number;
}): number {
  return -(1e-3 * opts.wirelength + 0.1 * opts.viaCount + 1e-4 * opts.runtimeMs);
}
