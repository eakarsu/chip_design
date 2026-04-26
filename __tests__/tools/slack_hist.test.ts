import { binSlacks, formatSlack } from '@/lib/tools/slack_hist';

describe('binSlacks', () => {
  it('handles empty input', () => {
    const h = binSlacks([]);
    expect(h.total).toBe(0);
    expect(h.bins).toHaveLength(0);
    expect(h.wns).toBe(0);
  });

  it('computes WNS and TNS over numbers', () => {
    const h = binSlacks([-0.3, -0.1, 0.05, 0.5, 1.2], { bins: 5 });
    expect(h.total).toBe(5);
    expect(h.wns).toBeCloseTo(-0.3, 6);
    expect(h.tns).toBeCloseTo(-0.4, 6);
    expect(h.violated).toBe(2);
  });

  it('places every path into exactly one bin', () => {
    const data = Array.from({ length: 50 }, (_, i) => -1 + (i / 49) * 3);
    const h = binSlacks(data, { bins: 10, min: -1, max: 2 });
    const sum = h.bins.reduce((a, b) => a + b.count, 0);
    expect(sum).toBe(50);
  });

  it('classifies bin bands by slack', () => {
    const h = binSlacks([-0.5, 0.05, 0.5, 1.0], { bins: 4, criticalMargin: 0.2 });
    expect(h.bins[0].band).toBe('violation');
    expect(h.bins[h.bins.length - 1].band).toBe('clean');
  });

  it('accepts TimingPath[] shape', () => {
    const paths = [
      { startpoint: 'a', endpoint: 'b', arrival: 1, required: 0.7, slack: -0.3, status: 'VIOLATED', stages: [] },
      { startpoint: 'c', endpoint: 'd', arrival: 1, required: 1.5, slack:  0.5, status: 'MET',      stages: [] },
    ] as never;
    const h = binSlacks(paths, { bins: 4 });
    expect(h.total).toBe(2);
    expect(h.violated).toBe(1);
  });
});

describe('formatSlack', () => {
  it('uses ps for sub-ns', () => {
    expect(formatSlack(0.123)).toMatch(/ps$/);
  });
  it('uses ns otherwise', () => {
    expect(formatSlack(2.5)).toMatch(/ns$/);
  });
});
