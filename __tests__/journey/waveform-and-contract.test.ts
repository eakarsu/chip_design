/** @jest-environment node */
import { gunzipSync } from 'zlib';
import { parseVcd, valueAt } from '@/lib/journey/waveform';
import { adaptivePractice } from '@/lib/journey/adaptive';
import { defaultSdc, journeyTemplates } from '@/lib/journey/catalog';
import {
  referenceProperties,
  referenceTestbench,
  revisionDigest,
  verificationInputs,
} from '@/lib/journey/verification';
import { tarGzip } from '@/lib/journey/hardware';
import type { DesignRevision, JourneyAssessment, JourneyRun } from '@/lib/journey/types';

const wave =
  '$timescale 1 ns $end\n$scope module top $end\n$var wire 1 ! clk $end\n$var wire 8 " data [7:0] $end\n$var wire 1 ! alias $end\n$upscope $end\n$enddefinitions $end\n$dumpvars\n0!\nbx "\n$end\n#5\n1!\nb1010 "\n#10\n0!\n';
it('parses VCD scope, aliases, vectors, X state, time scale and cursor values', () => {
  const parsed = parseVcd(wave);
  expect(parsed).toMatchObject({ timescale: '1 ns', endTime: 10, truncated: false });
  expect(parsed.signals.map((item) => item.name)).toEqual(['top.clk', 'top.data.[7:0]', 'top.alias']);
  expect(valueAt(parsed.signals[0], 7)).toBe('1');
  expect(valueAt(parsed.signals[1], 4)).toBe('x');
  expect(valueAt(parsed.signals[1], 7)).toBe('1010');
  expect(parsed.signals[2].transitions).toEqual(parsed.signals[0].transitions);
  expect(parseVcd(wave, { signals: 1, transitions: 2 }).truncated).toBe(true);
  expect(() => parseVcd(wave + '#1\n')).toThrow(/timestamp/);
  expect(() => parseVcd('$var wire 1')).toThrow(/Incomplete/);
  expect(() => parseVcd('x'.repeat(4000001))).toThrow(/4 MB/);
});

function reference(): DesignRevision {
  const template = journeyTemplates[0];
  const source = {
    templateId: template.id,
    topModule: template.topModule,
    specification: template.description,
    requirements: template.requirements,
    rtl: template.rtl,
    sdc: defaultSdc(template.topModule),
    testbench: referenceTestbench(template.id),
    properties: referenceProperties(template.id),
  };
  return {
    ...source,
    id: 'revision',
    projectId: 'project',
    number: 1,
    sourceHash: revisionDigest(source),
    createdBy: 'learner',
    createdAt: '2026-01-01',
  };
}
it('keeps grading harnesses fixed when engineering tests or targets are weakened', () => {
  const revision = reference();
  const baseline = verificationInputs(revision, 'simulation', 'lab');
  const altered = verificationInputs(
    {
      ...revision,
      testbench: 'assert True',
      requirements: revision.requirements.map((item) => ({ ...item, target: 100000 })),
    },
    'simulation',
    'lab'
  );
  expect(altered.suiteHash).toBe(baseline.suiteHash);
  expect(altered.inputs['test_design.py']).toBe(baseline.inputs['test_design.py']);
  expect(JSON.parse(altered.inputs['verification.json']).requirements).toEqual(revision.requirements);
  expect(verificationInputs({ ...revision, testbench: 'assert True' }, 'simulation', 'regression').suiteHash).not.toBe(
    baseline.suiteHash
  );
  for (const rtl of [
    'module gcd; initial $fopen("result"); endmodule',
    '`define F $f``open\nmodule gcd; endmodule',
    'module gcd; always @* assume(1); endmodule',
    '`include "properties.sv"',
    'module gcd; initial begin $display("/*"); $fopen("forged.xml"); $display("*/"); end endmodule',
  ]) {
    expect(() => verificationInputs({ ...revision, rtl }, 'formal', 'lab')).toThrow(/Graded RTL/);
  }
});

it('recommends preparation from demonstrated fixes and failed requirements', () => {
  const assessment = { challengeId: 'reset-stale', technicalPassed: true } as JourneyAssessment;
  const run = {
    purpose: 'lab',
    kind: 'simulation',
    report: {
      checks: [{ requirementId: 'latency', name: 'latency', status: 'failed', message: 'No completion by cycle 260' }],
    },
  } as JourneyRun;
  const practice = adaptivePractice('gcd', [run], [assessment]);
  expect(practice.challenges.find((item) => item.id === 'reset-stale')?.solved).toBe(true);
  expect(practice.challenges.find((item) => item.id === 'latency-budget')?.recommended).toBe(true);
  expect(practice.reason).toMatch(/cycle 260/);
});

it('writes standard USTAR padding/checksums and rejects path traversal', () => {
  const archive = gunzipSync(tarGzip({ 'src/design.v': 'abc', 'manifest.json': '{}' }));
  expect(archive.length % 512).toBe(0);
  const header = archive.subarray(0, 512);
  const checksum = parseInt(header.subarray(148, 154).toString(), 8);
  const copied = Buffer.from(header);
  copied.fill(32, 148, 156);
  expect(copied.reduce((sum, item) => sum + item, 0)).toBe(checksum);
  expect(header.subarray(257, 263).toString()).toBe('ustar\0');
  expect(() => tarGzip({ '../outside': 'bad' })).toThrow(/Unsafe/);
});
