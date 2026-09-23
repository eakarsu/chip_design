/** @jest-environment node */
import { SKY130_GCD_RTL, SKY130_GCD_SDC } from '@/lib/eda/referenceCase';
import { revisionDigest, verificationInputs } from '@/lib/journey/verification';
import type { DesignRevision } from '@/lib/journey/types';

it('changes the fixed GCD vectors and suite identity for the candidate verification seed', () => {
  const revision = {
    id: 'revision', projectId: 'project', number: 1, templateId: 'gcd', topModule: 'gcd',
    specification: 'Compute GCD under the fixed interface.', requirements: [],
    rtl: SKY130_GCD_RTL, sdc: SKY130_GCD_SDC, testbench: '', properties: '',
    createdBy: 'engineer', createdAt: 'now',
  } as Omit<DesignRevision, 'sourceHash'>;
  const withHash = { ...revision, sourceHash: revisionDigest(revision) };
  const baseline = verificationInputs(withHash, 'simulation', 'lab');
  const candidate = verificationInputs(withHash, 'simulation', 'lab', 73001);
  expect(candidate.suiteHash).not.toBe(baseline.suiteHash);
  expect(candidate.inputs['test_design.py']).toContain('random.Random(73001)');
  expect(candidate.inputs['test_design.py']).not.toContain('random.Random(2026)');
  expect(candidate.inputs['design.v']).toBe(baseline.inputs['design.v']);
});
