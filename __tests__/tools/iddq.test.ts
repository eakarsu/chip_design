import { planIddq } from '@/lib/tools/iddq';

describe('planIddq', () => {
  it('flags vectors above the threshold', () => {
    const vectors = [
      { name: 'v0', iddqUa: 1.0 },
      { name: 'v1', iddqUa: 1.1 },
      { name: 'v2', iddqUa: 1.05 },
      { name: 'v3', iddqUa: 1.2 },
      { name: 'v4', iddqUa: 50 },
    ];
    const r = planIddq({ vectors, baselineN: 4, k: 4 });
    expect(r.failing).toBeGreaterThanOrEqual(1);
    expect(r.reports.find(rp => rp.name === 'v4')!.bucket).toBe('fail');
  });

  it('passes a homogeneous population', () => {
    const vectors = Array.from({ length: 10 }, (_, i) => ({
      name: `v${i}`, iddqUa: 1.0,
    }));
    const r = planIddq({ vectors, baselineN: 10, k: 3 });
    expect(r.failing).toBe(0);
    expect(r.baselineStd).toBe(0);
  });

  it('throws on empty input', () => {
    expect(() => planIddq({ vectors: [] })).toThrow();
  });
});
