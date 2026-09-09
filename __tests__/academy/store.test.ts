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
import { getRawDb } from '@/lib/db/connection';

const learner: EdaIdentity = { tenantId: 'academy-test', userId: 'learner-1', role: 'editor' };
const instructor: EdaIdentity = { tenantId: 'academy-test', userId: 'instructor-1', role: 'admin' };

describe('Academy persistence', () => {
  it('preserves old writing grades but does not count them as executed mastery', async () => {
    const legacyLearner = { ...learner, userId: 'legacy-learner' };
    const created = await submitAcademyLab(legacyLearner, { labSlug: 'rtl-design-lab', response: 'module legacy; endmodule', evidence: [] }, 'legacy-fixture');
    const legacyGrade = { ...created.grade, score: 99, passed: true, status: 'passed', measurements: { hasReadyValidContract: true } };
    const db = getRawDb();
    db.prepare('UPDATE academy_submissions SET grade_json=?,score=99,passed=1 WHERE id=?').run(JSON.stringify(legacyGrade), created.id);
    db.prepare("UPDATE academy_progress SET status='passed',best_score=99,completed_at='2026-01-01' WHERE tenant_id=? AND user_id=?").run(legacyLearner.tenantId, legacyLearner.userId);
    const dashboard = await academyDashboard(legacyLearner);
    expect(dashboard.summary.completedModules).toBe(0);
    expect(dashboard.progress[0]).toMatchObject({ status: 'needs-review', bestScore: 0 });
    expect(dashboard.submissions[0].grade.measurements.legacyWrittenRubric).toBe(true);
    expect(db.prepare('SELECT passed FROM academy_submissions WHERE id=?').get(created.id)).toEqual({ passed: 1 });
    const instructorView = await instructorDashboard(instructor);
    expect(instructorView.learners.find(item => item.userId === legacyLearner.userId)?.completedModules).toBe(0);
    await submitAcademyLab(legacyLearner, { labSlug: 'rtl-design-lab', response: 'module still_unexecuted; endmodule', evidence: [] }, 'legacy-retry');
    expect((await academyDashboard(legacyLearner)).summary.completedModules).toBe(0);
  });
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
    expect(overview.learners.some(item => item.userId === learner.userId)).toBe(true);
    expect(overview.capstones[0].score).toBe(100);
  });
});
