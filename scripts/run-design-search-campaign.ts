/** Disposable end-to-end campaign against real model, verification and ORFS tools. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

async function main() {
  const { loadEnvConfig } = await import('@next/env');
  loadEnvConfig(process.cwd());
  const orfsImage = process.env.CHIP_SEARCH_ORFS_IMAGE;
  const verificationImage = process.env.CHIP_SEARCH_VERIFICATION_IMAGE;
  if (!orfsImage || !verificationImage || !/@sha256:[a-f0-9]{64}$/.test(orfsImage) ||
      !/@sha256:[a-f0-9]{64}$/.test(verificationImage))
    throw new Error('Set digest-pinned CHIP_SEARCH_ORFS_IMAGE and CHIP_SEARCH_VERIFICATION_IMAGE');
  const parent = path.resolve(process.env.CHIP_SEARCH_TEST_ROOT || path.join(process.cwd(), 'data'));
  fs.mkdirSync(parent, { recursive: true });
  const root = fs.mkdtempSync(path.join(parent, 'design-search-live-'));
  process.env.CHIP_DB_PATH = path.join(root, 'campaign.sqlite');
  process.env.CHIP_EDA_OBJECT_DIR = path.join(root, 'eda');
  process.env.CHIP_OBJECT_STORAGE_ROOT = path.join(root, 'objects');
  process.env.CHIP_COMMERCIAL_DATABASE_URL = '';
  process.env.DATABASE_URL = '';
  process.env.CHIP_OBJECT_STORAGE_BUCKET = '';
  process.env.CHIP_ALLOW_SCHEMA_MIGRATION = 'true';
  process.env.CHIP_OPENROAD_IMAGE = orfsImage;
  process.env.CHIP_SIMULATION_IMAGE = verificationImage;
  process.env.CHIP_FORMAL_IMAGE = verificationImage;
  process.env.CHIP_JOURNEY_PDK_DIGEST = orfsImage.split('@sha256:')[1];
  console.log(`Isolated campaign evidence: ${root}`);

  const journey = await import('../src/lib/journey/store');
  const search = await import('../src/lib/design-search/store');
  const eda = await import('../src/lib/eda/store');
  const { executeJob } = await import('../src/lib/eda/worker');
  const editor = { tenantId: 'live-design-search', userId: 'campaign-engineer', role: 'editor' as const };
  const reviewer = { ...editor, userId: 'independent-smoke-reviewer', role: 'admin' as const };
  const workerId = `design-search-smoke-${process.pid}`;
  const result: Record<string, unknown> = { root, startedAt: new Date().toISOString() };

  async function runJob(jobId: string) {
    const pending = eda.getJob(editor, jobId);
    assert.ok(pending, `Missing queued job ${jobId}`);
    if (pending.status === 'awaiting_approval') eda.approveJob(reviewer, jobId);
    const claimed = eda.claimNextJob(workerId);
    assert.equal(claimed?.id, jobId, `Queue order changed before ${jobId}`);
    console.log(`Running ${claimed.kind} ${jobId}`);
    const finished = await executeJob(claimed, workerId);
    console.log(`Finished ${claimed.kind} ${jobId}: ${finished.status}`);
    if (finished.status !== 'succeeded') throw new Error(`${claimed.kind} failed: ${finished.error || finished.status}`);
    return finished;
  }

  try {
    const revision = await journey.startJourney(editor, {
      name: `Live GCD search ${Date.now()}`, templateId: 'gcd',
    }, 'live-search-start');
    result.projectId = revision.projectId;
    result.revisionId = revision.id;
    for (const kind of ['simulation', 'formal'] as const) {
      const run = await journey.launchJourneyRun(editor, revision.projectId, {
        revisionId: revision.id, kind, purpose: 'lab', idempotencyKey: randomUUID(),
      }, `live-search-${kind}`);
      await runJob(run.jobId);
      const report = await journey.getJourneyRun(editor, revision.projectId, run.id);
      assert.equal(report.report?.outcome, 'passed', `${kind} baseline contract failed`);
    }
    const campaign = await search.createSearchCampaign(editor, {
      projectId: revision.projectId, revisionId: revision.id,
      objective: 'min_area', topic: 'rtl', maxCandidates: 3,
      jobCpuSeconds: 1800, maxCpuSeconds: 5400,
    }, 'live-search-create');
    result.campaignId = campaign.id;
    let details = await search.searchCampaignDetails(editor, campaign.id);
    const baseline = details.candidates.find((candidate) => candidate.kind === 'baseline')!;
    details = await search.dispatchSearchCandidate(editor, campaign.id, baseline.id, 'live-search-baseline');
    await runJob(details.candidates.find((candidate) => candidate.id === baseline.id)!.jobId!);
    details = await search.searchCampaignDetails(editor, campaign.id);
    assert.ok(details.candidates.find((candidate) => candidate.id === baseline.id)?.qualified,
      'Physical baseline did not qualify; see retained ORFS reports');
    console.log(`Measured baseline area: ${details.candidates.find((candidate) => candidate.id === baseline.id)?.metrics?.dieAreaUm2}`);

    await search.researchCampaign(editor, campaign.id, 'live-search-research');
    details = await search.generateSearchCandidates(editor, campaign.id, 'live-search-propose');
    result.proposedCandidates = details.candidates.filter((candidate) => candidate.kind === 'rtl')
      .map((candidate) => ({ id: candidate.id, title: candidate.title, rtlSourceHash: candidate.rtlSourceHash }));
    for (const candidate of details.candidates.filter((item) => item.kind === 'rtl')) {
      details = await search.dispatchRtlVerification(editor, campaign.id, candidate.id, 'live-search-verify');
      const queued = details.candidates.find((item) => item.id === candidate.id)!;
      await runJob(queued.simulationJobId!);
      await runJob(queued.formalJobId!);
      await runJob(queued.proofJobId!);
      details = await search.searchCampaignDetails(editor, campaign.id);
      const evaluated = details.candidates.find((item) => item.id === candidate.id)!;
      console.log(`Candidate ${candidate.id} verification: ${JSON.stringify(evaluated.verification)}`);
      if (!evaluated.verification?.simulationPassed || !evaluated.verification.formalPassed ||
          !evaluated.verification.proofPassed) continue;
      details = await search.dispatchSearchCandidate(editor, campaign.id, candidate.id, 'live-search-physical');
      await runJob(details.candidates.find((item) => item.id === candidate.id)!.jobId!);
      break;
    }
    details = await search.searchCampaignDetails(editor, campaign.id);
    result.candidates = details.candidates.map((candidate) => ({ id: candidate.id, title: candidate.title,
      status: candidate.status, qualified: candidate.qualified, score: candidate.score,
      metrics: candidate.metrics, verification: candidate.verification, reasons: candidate.reasons }));
    result.bestCandidateId = details.bestCandidateId;
    result.completedAt = new Date().toISOString();
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
    result.stoppedAt = new Date().toISOString();
    process.exitCode = 1;
  } finally {
    fs.writeFileSync(path.join(root, 'campaign-summary.json'), JSON.stringify(result, null, 2));
    console.log(`Campaign summary: ${path.join(root, 'campaign-summary.json')}`);
    if (result.error) console.error(result.error);
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
