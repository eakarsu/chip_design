/** Real tools and the real queue/store, in an isolated disposable workspace. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { DesignRevision, JourneyRun, VerificationKind } from '../src/lib/journey/types';

async function main() {
  const image = process.env.CHIP_JOURNEY_TEST_IMAGE;
  const parent = process.env.CHIP_JOURNEY_TEST_ROOT;
  if (!image || !/@sha256:[a-f0-9]{64}$/.test(image) || !parent || !path.isAbsolute(parent))
    throw new Error(
      'Set CHIP_JOURNEY_TEST_IMAGE to the built verification image digest and CHIP_JOURNEY_TEST_ROOT to an absolute directory shared with Docker'
    );
  fs.mkdirSync(parent, { recursive: true });
  const root = fs.mkdtempSync(path.join(parent, 'journey-smoke-'));
  process.env.CHIP_DB_PATH = path.join(root, 'smoke.sqlite');
  process.env.CHIP_EDA_OBJECT_DIR = path.join(root, 'eda');
  process.env.CHIP_OBJECT_STORAGE_ROOT = path.join(root, 'objects');
  process.env.CHIP_COMMERCIAL_DATABASE_URL = '';
  process.env.DATABASE_URL = '';
  process.env.CHIP_OBJECT_STORAGE_BUCKET = '';
  process.env.CHIP_ALLOW_SCHEMA_MIGRATION = 'true';
  process.env.CHIP_SIMULATION_IMAGE = image;
  process.env.CHIP_FORMAL_IMAGE = image;
  const journey = await import('../src/lib/journey/store');
  const eda = await import('../src/lib/eda/store');
  const { executeJob } = await import('../src/lib/eda/worker');
  const { debugChallenges, journeyTemplates } = await import('../src/lib/journey/catalog');
  const { exportJourney, tinyTapeoutWrapper, tinyTapeoutTestbench } = await import('../src/lib/journey/hardware');
  const { parseVcd } = await import('../src/lib/journey/waveform');
  const identity = { tenantId: 'real-verification', userId: 'real-verification-learner', role: 'editor' as const };
  const results: Array<Record<string, unknown>> = [];
  const worker = `smoke-${process.pid}`;
  async function execute(
    revision: DesignRevision,
    kind: VerificationKind,
    expected: 'passed' | 'failed' | 'error',
    purpose: 'lab' | 'regression' = 'lab'
  ): Promise<JourneyRun> {
    const run = await journey.launchJourneyRun(
      identity,
      revision.projectId,
      { revisionId: revision.id, kind, purpose, idempotencyKey: randomUUID() },
      'real-smoke'
    );
    const job = eda.claimNextJob(worker)!;
    assert.equal(job.id, run.jobId);
    await executeJob(job, worker);
    const finished = await journey.getJourneyRun(identity, revision.projectId, run.id);
    assert.equal(finished.jobStatus, 'succeeded', `Tool failed: ${finished.error}; ${eda.jobWorkspace(job)}`);
    assert.equal(finished.report?.outcome, expected, JSON.stringify(finished.report ?? finished));
    if (expected === 'failed') {
      const failures = finished.report!.checks.filter((check) => check.status === 'failed');
      assert.ok(
        failures.length && failures.every((check) => check.message.trim().length > 10 && check.source),
        'Failed checks must retain behavior and source locations'
      );
    }
    if ((kind === 'simulation' && expected !== 'error') || (kind === 'formal' && expected === 'failed')) {
      assert.ok(finished.report!.waveforms.length, 'Missing waveform/counterexample');
      const artifact = finished.artifacts.find((item) => item.relativePath === finished.report!.waveforms[0])!;
      const wave = parseVcd(journey.verifiedRunArtifact(identity, job.id, artifact).toString('utf8'));
      assert.ok(wave.signals.length && wave.endTime > 0);
    }
    if (purpose === 'lab') {
      const grade = await journey.gradeJourneyRun(
        identity,
        revision.projectId,
        run.id,
        'Observed the actual fixed suite against retained source. The expected outcome is compared independently; physical timing and unbounded proof remain outside this run.',
        'real-grade'
      );
      assert.equal(grade.technicalPassed, expected === 'passed');
    }
    results.push({
      template: revision.templateId,
      challenge: revision.challengeId,
      kind,
      expected,
      actual: finished.report?.outcome,
      seconds: finished.report?.elapsedSeconds,
      jobId: job.id,
      sourceHash: revision.sourceHash,
    });
    fs.writeFileSync(path.join(root, 'results.json'), JSON.stringify(results, null, 2));
    console.log(JSON.stringify(results.at(-1)));
    return finished;
  }
  let gcd: DesignRevision | undefined;
  for (const template of journeyTemplates) {
    const revision = await journey.startJourney(
      identity,
      { name: `Real ${template.id}`, templateId: template.id },
      'real-start'
    );
    if (template.id === 'gcd') gcd = revision;
    await execute(revision, 'simulation', 'passed');
    await execute(revision, 'formal', 'passed');
  }
  for (const challenge of debugChallenges) {
    const revision = await journey.startJourney(
      identity,
      { name: `Real ${challenge.id}`, templateId: challenge.templateId },
      'real-challenge'
    );
    const broken = await journey.startChallenge(
      identity,
      revision.projectId,
      challenge.id,
      revision.id,
      'real-challenge-start'
    );
    await execute(broken, 'simulation', 'failed');
    if (challenge.id === 'fifo-overflow') await execute(broken, 'formal', 'failed');
  }
  assert.ok(gcd);
  fs.writeFileSync(
    path.join(root, 'tinytapeout.tar.gz'),
    await exportJourney(identity, gcd.projectId, gcd.id, 'tinytapeout')
  );
  const { templateId, specification, requirements, sdc, properties } = gcd;
  const wrapper = await journey.saveRevision(
    identity,
    gcd.projectId,
    {
      baseRevisionId: gcd.id,
      templateId,
      specification,
      requirements,
      sdc,
      properties,
      topModule: 'tt_um_neuralchip_gcd',
      rtl: gcd.rtl + '\n' + tinyTapeoutWrapper(gcd),
      testbench: tinyTapeoutTestbench(),
    },
    'wrapper-test'
  );
  await execute(wrapper, 'simulation', 'passed', 'regression');
  const brokenSyntax = await journey.saveRevision(
    identity,
    gcd.projectId,
    {
      baseRevisionId: wrapper.id,
      templateId,
      specification,
      requirements,
      sdc,
      properties,
      topModule: 'gcd',
      rtl: 'module gcd (this is not valid syntax); endmodule',
      testbench: gcd.testbench,
    },
    'compiler-test'
  );
  await execute(brokenSyntax, 'simulation', 'error');
  console.log(`Real verification complete; retained evidence: ${root}`);
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
