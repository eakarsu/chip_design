/**
 * @jest-environment node
 */
import { bayesianOptimize } from '@/lib/algorithms/bayesopt';

describe('Bayesian optimizer', () => {
  test('finds the minimum of a 1-D quadratic', async () => {
    // f(x) = (x - 0.7)^2  on [0,1] — minimum at 0.7.
    const r = await bayesianOptimize(
      [{ name: 'x', min: 0, max: 1 }],
      ({ x }) => (x - 0.7) ** 2,
      { budget: 25, initialSamples: 5, seed: 42 },
    );
    expect(r.trials).toHaveLength(25);
    expect(Math.abs(r.best.params.x - 0.7)).toBeLessThan(0.1);
    expect(r.best.value).toBeLessThan(0.02);
  });

  test('best-so-far trace is monotonically non-increasing', async () => {
    const r = await bayesianOptimize(
      [{ name: 'x', min: -2, max: 2 }, { name: 'y', min: -2, max: 2 }],
      ({ x, y }) => x * x + y * y,
      { budget: 12, initialSamples: 3, seed: 7 },
    );
    for (let i = 1; i < r.trace.length; i++) {
      expect(r.trace[i]).toBeLessThanOrEqual(r.trace[i - 1]);
    }
  });

  test('respects integer dimension', async () => {
    const r = await bayesianOptimize(
      [{ name: 'k', min: 1, max: 10, integer: true }],
      ({ k }) => Math.abs(k - 7),
      { budget: 12, initialSamples: 3, seed: 1 },
    );
    for (const t of r.trials) {
      expect(Number.isInteger(t.params.k)).toBe(true);
    }
    // Integer optimum is 7.
    expect(r.best.params.k).toBe(7);
  });

  test('throws when no dimensions provided', async () => {
    await expect(
      bayesianOptimize([], () => 0, { budget: 2 }),
    ).rejects.toThrow(/dimension/);
  });
});
