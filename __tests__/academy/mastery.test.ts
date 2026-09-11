/** @jest-environment node */
process.env.CHIP_DB_PATH = ':memory:';

import { randomUUID } from 'crypto';
import { getRawDb, resetDbForTests } from '@/lib/db/connection';
import { academyLabs } from '@/lib/academy/catalog';
import { masteryForUser } from '@/lib/academy/mastery';
import { submitAcademyLab } from '@/lib/academy/store';
import type { EdaIdentity } from '@/lib/eda/identity';

const tenantId = 'mastery-test';

function learner(userId: string): EdaIdentity {
  return { tenantId, userId, role: 'editor' };
}

const architectureResponse = `# Architecture evidence\nThe workload requires measurable throughput, tail latency, energy efficiency and bandwidth utilization. Assumption: representative traces exist. The tradeoff compares a CPU, accelerator and rejected software-only alternative because data movement dominates energy. Acceptance threshold: latency below 10 ms and power below 5 W. Stop condition: block review if traffic measurements or interface contracts are missing. Architecture owner review and approval are required. The report records tool version, measurements, risk, limitations and the verification method.`;

const architectureEvidence = ['git/spec-01 commit sha', 'runs/model-01/measurement-report.rpt version 1', 'reviews/architecture-01 accountable owner'];

function storeAssessment(userId: string, input: { challengeId: string; technicalPassed: boolean; explanationScore: number | null }) {
  getRawDb()
    .prepare('INSERT INTO design_journey_assessments (id, tenant_id, project_id, run_id, user_id, document_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(
      randomUUID(),
      tenantId,
      randomUUID(),
      randomUUID(),
      userId,
      JSON.stringify({
        id: randomUUID(),
        runId: randomUUID(),
        revisionId: randomUUID(),
        challengeId: input.challengeId,
        correctness: 60,
        reproducibility: 25,
        explanation: 'Fixed the boundary comparison and reran the fixed simulation suite.',
        explanationScore: input.explanationScore,
        technicalPassed: input.technicalPassed,
        userId,
        createdAt: new Date().toISOString(),
        feedback: input.technicalPassed ? 'Executed checks passed.' : 'Revise and rerun.',
      }),
      new Date().toISOString()
    );
}

describe('Academy mastery aggregation', () => {
  beforeEach(() => {
    resetDbForTests();
  });

  it('derives topics from the catalog and returns zeros for a brand-new learner', async () => {
    const summary = await masteryForUser({ tenantId, userId: 'brand-new' });
    expect(summary.topics.map(topic => topic.id)).toEqual(academyLabs.map(lab => lab.topicSlug));
    expect(summary.topics.every(topic => topic.pct === 0 && topic.level === 'not-started')).toBe(true);
    expect(summary.topics.every(topic => topic.evidence.gradedLabs === 0 && topic.evidence.passedLabs === 0 && topic.evidence.challengeFixes === 0 && topic.evidence.capstones === 0)).toBe(true);
    expect(summary.overallPct).toBe(0);
    expect(Number.isNaN(Date.parse(summary.generatedAt))).toBe(false);
  });

  it('raises only the graded topic above zero and keeps overallPct within 0..100', async () => {
    const user = learner('passed-learner');
    const submission = await submitAcademyLab(user, {
      labSlug: 'product-requirements-and-architecture-lab',
      response: architectureResponse,
      evidence: architectureEvidence,
    }, 'mastery-lab');
    expect(submission.grade.passed).toBe(true);

    const summary = await masteryForUser(user);
    const topic = summary.topics.find(item => item.id === 'product-requirements-and-architecture')!;
    expect(topic).toBeDefined();
    expect(topic.evidence.gradedLabs).toBe(1);
    expect(topic.evidence.passedLabs).toBe(1);
    expect(topic.pct).toBe(submission.grade.score);
    expect(topic.pct).toBeGreaterThan(0);
    expect(topic.level).not.toBe('not-started');
    expect(summary.topics.filter(item => item.pct > 0)).toHaveLength(1);
    expect(summary.overallPct).toBeGreaterThan(0);
    expect(summary.overallPct).toBeGreaterThanOrEqual(0);
    expect(summary.overallPct).toBeLessThanOrEqual(100);
  });

  it('counts executed journey challenge fixes against their curriculum topic', async () => {
    const user = learner('challenge-learner');
    await masteryForUser(user);
    storeAssessment(user.userId, { challengeId: 'fifo-overflow', technicalPassed: true, explanationScore: 12 });
    storeAssessment(user.userId, { challengeId: 'latency-budget', technicalPassed: false, explanationScore: null });

    const summary = await masteryForUser(user);
    const verification = summary.topics.find(item => item.id === 'functional-verification')!;
    expect(verification.evidence.challengeFixes).toBe(1);
    expect(verification.pct).toBe(97);
    expect(verification.level).toBe('mastered');

    const rtl = summary.topics.find(item => item.id === 'rtl-design')!;
    expect(rtl.evidence.challengeFixes).toBe(0);
    expect(rtl.pct).toBe(0);
  });
});
