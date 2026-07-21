/** @jest-environment node */
import fixture from '../../fixtures/eda/tiny_reference/golden.json';
import { validateGolden, type GoldenManifest, type GoldenObservation } from '@/lib/eda/golden';

const manifest = fixture.manifest as GoldenManifest;
const observation = fixture.observation as GoldenObservation;

describe('EDA golden validation', () => {
  it('accepts the pinned deterministic reference within all tolerances', () => {
    expect(validateGolden(manifest, observation)).toEqual({ passed: true, failures: [] });
  });

  it('rejects timing, DRC, IR-drop, congestion, and HPWL drift', () => {
    const result = validateGolden(manifest, {
      ...observation,
      metrics: { wns: -1, drc_violations: 2, ir_drop_mv: 40, congestion_overflow: 0.2, hpwl: 8000 },
    });
    expect(result.passed).toBe(false);
    expect(result.failures).toHaveLength(5);
  });

  it('rejects provenance, performance, and GDS-equivalence signature drift', () => {
    const result = validateGolden(manifest, {
      ...observation, toolImage: 'changed', pdkDigest: 'changed', runtimeMs: 30_001,
      artifacts: { 'layout.signature': '0'.repeat(64) },
    });
    expect(result.failures).toEqual(expect.arrayContaining([
      'tool image differs from golden provenance',
      'PDK digest differs from golden provenance',
      'runtime 30001ms exceeds 30000ms ceiling',
      'artifact layout.signature differs from golden output',
    ]));
  });
});
