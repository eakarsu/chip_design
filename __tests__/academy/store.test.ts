/** @jest-environment node */
process.env.CHIP_DB_PATH = ':memory:';

import type { EdaIdentity } from '@/lib/eda/identity';
import {
  academyDashboard,
  instructorDashboard,
  saveCapstone,
  submitAcademyLab,
  submitDiagnostic,
} from '@/lib/academy/store';
import { diagnosticQuestions } from '@/lib/academy/catalog';

const learner: EdaIdentity = { tenantId: 'academy-test', userId: 'learner-1', role: 'editor' };
const instructor: EdaIdentity = { tenantId: 'academy-test', userId: 'instructor-1', role: 'admin' };

describe('Academy persistence', () => {
  it('creates enrollment, retains attempts, diagnostic results and capstone evidence', async () => {
    const initial = await academyDashboard(learner);
    expect(initial.labs).toHaveLength(21);
    expect(initial.summary.completedModules).toBe(0);

    const submission = await submitAcademyLab(learner, {
      labSlug: 'product-requirements-and-architecture-lab',
      response: `# Architecture evidence\nThe workload requires measurable throughput, tail latency, energy efficiency and bandwidth utilization. Assumption: representative traces exist. The tradeoff compares a CPU, accelerator and rejected software-only alternative because data movement dominates energy. Acceptance threshold: latency below 10 ms and power below 5 W. Stop condition: block review if traffic measurements or interface contracts are missing. Architecture owner review and approval are required. The report records tool version, measurements, risk, limitations and the verification method.`,
      evidence: ['git/spec-01 commit sha', 'runs/model-01/measurement-report.rpt version 1', 'reviews/architecture-01 accountable owner'],
    }, 'submission-request');
    expect(submission.attempt).toBe(1);

    const answers = Object.fromEntries(diagnosticQuestions.map(question => [question.id, question.correctIndex]));
    const diagnostic = await submitDiagnostic(learner, answers, 'diagnostic-request');
    expect(diagnostic.score).toBe(100);

    const saved = await saveCapstone(learner, {
      specification: 'A'.repeat(1_100), architecture: 'B'.repeat(1_300), verificationPlan: 'C'.repeat(1_300),
      evidence: ['requirements', 'rtl', 'verification', 'timing', 'power'], submit: true,
    }, 'capstone-request');
    expect(saved.score).toBe(100);
    expect(saved.status).toBe('submitted');

    const reloaded = await academyDashboard(learner);
    expect(reloaded.enrollment.diagnosticScore).toBe(100);
    expect(reloaded.submissions).toHaveLength(1);
    expect(reloaded.capstone?.status).toBe('submitted');

    const overview = await instructorDashboard(instructor);
    expect(overview.learners[0].userId).toBe(learner.userId);
    expect(overview.capstones[0].score).toBe(100);
  });
});
