/**
 * @jest-environment node
 */
import { parameterSweep } from '@/lib/algorithms/sweep';

describe('parameter sweep', () => {
  test('grid covers full Cartesian product', async () => {
    const r = await parameterSweep(
      [
        { name: 'x', min: 0, max: 1 },
        { name: 'y', min: 0, max: 1 },
      ],
      ({ x, y }) => x + y,
      { strategy: 'grid', steps: 3 },
    );
    expect(r.trials).toHaveLength(9);
    expect(r.best.value).toBeCloseTo(0, 5);
    expect(r.worst.value).toBeCloseTo(2, 5);
  });

  test('random produces requested sample count', async () => {
    const r = await parameterSweep(
      [{ name: 'x', min: -5, max: 5 }],
      ({ x }) => x * x,
      { strategy: 'random', samples: 25, seed: 1 },
    );
    expect(r.trials).toHaveLength(25);
    expect(r.best.value).toBeGreaterThanOrEqual(0);
    expect(r.mean).toBeGreaterThan(0);
  });

  test('integer dim is honored', async () => {
    const r = await parameterSweep(
      [{ name: 'k', min: 1, max: 5, integer: true }],
      ({ k }) => k,
      { strategy: 'grid', steps: 5 },
    );
    expect(r.trials).toHaveLength(5);
    expect(r.trials.map(t => t.params.k).sort()).toEqual([1, 2, 3, 4, 5]);
  });

  test('mean / stddev are correct for known input', async () => {
    const values = [1, 2, 3, 4, 5];
    let i = 0;
    const r = await parameterSweep(
      [{ name: 'x', min: 0, max: 1 }],
      () => values[i++],
      { strategy: 'grid', steps: 5 },
    );
    expect(r.mean).toBeCloseTo(3, 5);
    // stddev (population): sqrt(2)
    expect(r.stddev).toBeCloseTo(Math.sqrt(2), 5);
  });
});
