import {
  buildOrfsConfig,
  buildSpiceMatrix,
  buildYosysFlow,
  compareMetricSets,
  readinessScore,
} from '@/lib/operations/domain';
import { normalizeAdapterResult } from '@/lib/operations/adapters';

describe('engineering operations domain', () => {
  it('builds bounded, injection-resistant governed flow inputs', () => {
    expect(buildYosysFlow('chip_top')).toContain('hierarchy -check -top chip_top');
    expect(() => buildYosysFlow('top; shell')).toThrow(/Invalid Verilog top module/);
    const config = buildOrfsConfig({ topModule: 'chip_top', coreUtilization: 200, placeDensity: 0.01 });
    expect(config).toContain('CORE_UTILIZATION = 80');
    expect(config).toContain('PLACE_DENSITY = 0.2');
  });

  it('compares normalized metrics using engineering directionality', () => {
    const comparison = compareMetricSets(
      { area_um2: 100, power_mw: 10, wns_ns: -0.1 },
      { area_um2: 90, power_mw: 12, wns_ns: 0.05 }
    );
    expect(comparison.find((item) => item.key === 'area_um2')?.direction).toBe('improved');
    expect(comparison.find((item) => item.key === 'power_mw')?.direction).toBe('regressed');
    expect(comparison.find((item) => item.key === 'wns_ns')?.direction).toBe('improved');
  });

  it('materializes deterministic bounded PVT and Monte Carlo work items', () => {
    const points = buildSpiceMatrix({
      processes: ['tt', 'ss'],
      voltages: [1.8],
      temperatures: [-40, 125],
      monteCarloSeeds: 3,
    });
    expect(points).toHaveLength(12);
    expect(new Set(points.map((point) => point.id)).size).toBe(12);
    expect(() =>
      buildSpiceMatrix({
        processes: Array.from({ length: 101 }, (_, i) => `p${i}`),
        voltages: [1, 2],
        temperatures: Array(50).fill(25),
        monteCarloSeeds: 2,
      })
    ).toThrow(/10,000/);
  });

  it('scores pass and independently waived checks differently', () => {
    expect(
      readinessScore([
        { key: 'a', label: 'A', domain: 'A', state: 'pass', coverage: '', evidence: [], blockers: [] },
        { key: 'b', label: 'B', domain: 'B', state: 'waived', coverage: '', evidence: [], blockers: [] },
        { key: 'c', label: 'C', domain: 'C', state: 'missing', coverage: '', evidence: [], blockers: [] },
      ])
    ).toBe(50);
  });

  it('normalizes commercial adapter evidence deterministically', () => {
    const result = normalizeAdapterResult({
      runRef: 'run-1',
      tool: { vendor: 'Vendor', product: 'STA', version: '1', licenseRef: 'entitlement-1' },
      metrics: { wns_ns: 0.1, area_um2: 100 },
      reports: [{ kind: 'sta', uri: 'reports/sta.rpt', sha256: 'a'.repeat(64) }],
      corners: ['ss', 'tt', 'ss'],
      completedAt: '2026-08-09T12:00:00.000Z',
    });
    expect(Object.keys(result.metrics)).toEqual(['area_um2', 'wns_ns']);
    expect(result.corners).toEqual(['ss', 'tt']);
  });
});
