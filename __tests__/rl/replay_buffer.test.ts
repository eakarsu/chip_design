/**
 * @jest-environment node
 */
process.env.CHIP_DB_PATH = ':memory:';

import { ReplayBuffer, placementReward, routingReward, Transition } from '@/lib/rl/replay_buffer';
import { algorithmRuns } from '@/lib/db';
import { resetDbForTests } from '@/lib/db/connection';

beforeEach(() => { resetDbForTests(); });

function sample(id: string, action: string, reward: number, priority = 1): Transition {
  return {
    id, category: 'placement', action,
    parameters: { iterations: 100 },
    stateHash: 'h', reward, priority,
  };
}

describe('ReplayBuffer — in-memory behaviour', () => {
  it('push stores transitions and size() reflects count', () => {
    const buf = new ReplayBuffer({ persistent: false });
    buf.push(sample('a', 'force_directed', -100));
    buf.push(sample('b', 'quadratic', -50));
    expect(buf.size()).toBe(2);
  });

  it('sampleUniform returns the requested count without duplicates', () => {
    const buf = new ReplayBuffer({ persistent: false });
    for (let i = 0; i < 10; i++) buf.push(sample(`t${i}`, 'x', -i));
    // Deterministic but varying rng — must hit distinct floor() buckets.
    let k = 0;
    const rng = () => { k++; return (k * 0.137) % 1; };
    const s = buf.sampleUniform(5, rng);
    expect(s).toHaveLength(5);
    const ids = new Set(s.map(t => t.id));
    expect(ids.size).toBe(5);
  });

  it('samplePrioritized picks high-priority items more often', () => {
    const buf = new ReplayBuffer({ persistent: false });
    buf.push(sample('lo1', 'x', 0, /*priority=*/0.01));
    buf.push(sample('lo2', 'x', 0, 0.01));
    buf.push(sample('hi',  'x', 0, /*priority=*/100));

    // Deterministic rng sequence.
    let c = 0;
    const rng = () => { c++; return ((c * 0.37) % 1); };
    let hi = 0;
    for (let trial = 0; trial < 200; trial++) {
      const s = buf.samplePrioritized(1, 1.0, rng);
      if (s[0]?.id === 'hi') hi++;
    }
    expect(hi).toBeGreaterThan(100);
  });
});

describe('ReplayBuffer — persistence', () => {
  it('flush writes to algorithm_runs and clears memory', () => {
    const buf = new ReplayBuffer({ persistent: true, flushThreshold: 100 });
    buf.push(sample('r1', 'quadratic', -75));
    buf.push(sample('r2', 'force_directed', -60));
    expect(buf.size()).toBe(2);

    const written = buf.flush();
    expect(written).toBe(2);
    expect(buf.size()).toBe(0);

    const all = algorithmRuns.list();
    expect(all.map(x => x.id).sort()).toEqual(['r1', 'r2']);
    expect(all.find(x => x.id === 'r1')!.result.reward).toBe(-75);
  });

  it('auto-flushes once flushThreshold is reached', () => {
    const buf = new ReplayBuffer({ persistent: true, flushThreshold: 3 });
    buf.push(sample('a', 'q', -1));
    buf.push(sample('b', 'q', -2));
    buf.push(sample('c', 'q', -3));  // threshold hit
    expect(buf.size()).toBe(0);
    expect(algorithmRuns.list()).toHaveLength(3);
  });

  it('hydrateFromDb loads historical transitions back into memory', () => {
    const buf = new ReplayBuffer({ persistent: true, flushThreshold: 100 });
    buf.push(sample('x', 'a1', -10));
    buf.push(sample('y', 'a2', -5));
    buf.flush();

    const buf2 = new ReplayBuffer({ persistent: false });
    const n = buf2.hydrateFromDb({ category: 'placement' });
    expect(n).toBe(2);
    expect(buf2.size()).toBe(2);
    const rewards = buf2.peek().map(t => t.reward).sort();
    expect(rewards).toEqual([-10, -5]);
  });
});

describe('Reward shaping helpers', () => {
  it('placementReward is higher-is-better (negative of cost)', () => {
    const good = placementReward({ hpwl: 100, overlap: 1, runtimeMs: 10 });
    const bad  = placementReward({ hpwl: 1000, overlap: 100, runtimeMs: 1000 });
    expect(good).toBeGreaterThan(bad);
    expect(good).toBeLessThanOrEqual(0); // still negative because weights are positive
  });

  it('routingReward penalises via count', () => {
    const few = routingReward({ wirelength: 1000, viaCount: 5, runtimeMs: 100 });
    const many = routingReward({ wirelength: 1000, viaCount: 500, runtimeMs: 100 });
    expect(few).toBeGreaterThan(many);
  });
});
