import 'server-only';

import { randomUUID } from 'crypto';
import type { EdaIdentity } from '@/lib/eda/identity';
import { all, one, run } from '@/lib/commercial/database';
import { academyLabs, academyPaths, capstoneDefinition, diagnosticQuestions, getAcademyLab } from './catalog';
import { gradeAcademyLab, gradeDiagnostic } from './grader';
import type {
  AcademyCapstone,
  AcademyDashboard,
  AcademyGrade,
  AcademyProgress,
  AcademySubmission,
  AcademyTutorBrief,
} from './types';

type Row = Record<string, unknown>;
const now = () => new Date().toISOString();
const json = (value: unknown) => JSON.stringify(value);
const parse = <T>(value: unknown, fallback: T): T => {
  try { return typeof value === 'string' ? JSON.parse(value) as T : fallback; } catch { return fallback; }
};
const numeric = (value: unknown) => Number(value ?? 0);

async function audit(identity: EdaIdentity, action: string, resourceId: string, details: unknown, requestId: string): Promise<void> {
  await run(
    'INSERT INTO commercial_audit_events (id, tenant_id, actor_id, action, resource, resource_id, details_json, request_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [randomUUID(), identity.tenantId, identity.userId, action, 'academy', resourceId, json(details), requestId, now()],
  );
}

async function ensureEnrollment(identity: EdaIdentity): Promise<Row> {
  const existing = await one('SELECT * FROM academy_enrollments WHERE tenant_id = ? AND user_id = ?', [identity.tenantId, identity.userId]);
  if (existing) return existing;
  const timestamp = now();
  const id = randomUUID();
  await run('INSERT INTO academy_enrollments (id, tenant_id, user_id, path_slug, status, diagnostic_score, started_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [
    id, identity.tenantId, identity.userId, 'complete-chip-designer', 'active', null, timestamp, timestamp,
  ]);
  return (await one('SELECT * FROM academy_enrollments WHERE id = ?', [id]))!;
}

function submission(row: Row): AcademySubmission {
  return {
    id: String(row.id),
    labSlug: String(row.lab_slug),
    topicSlug: String(row.topic_slug),
    response: String(row.response_text),
    evidence: parse(row.evidence_json, []),
    grade: parse<AcademyGrade>(row.grade_json, {
      score: numeric(row.score), passed: Boolean(row.passed), status: 'needs-review', summary: 'Stored grade unavailable.', strengths: [], improvements: [], criteria: [], measurements: {},
    }),
    attempt: numeric(row.attempt),
    createdAt: String(row.created_at),
  };
}

function progress(row: Row): AcademyProgress {
  return {
    topicSlug: String(row.topic_slug),
    status: String(row.status) as AcademyProgress['status'],
    bestScore: numeric(row.best_score),
    attempts: numeric(row.attempts),
    completedAt: row.completed_at ? String(row.completed_at) : undefined,
    updatedAt: String(row.updated_at),
  };
}

function capstone(row: Row): AcademyCapstone {
  return {
    id: String(row.id), title: String(row.title), specification: String(row.specification),
    architecture: String(row.architecture), verificationPlan: String(row.verification_plan),
    evidence: parse(row.evidence_json, []), status: String(row.status) as AcademyCapstone['status'],
    score: numeric(row.score), feedback: String(row.feedback), updatedAt: String(row.updated_at),
  };
}

export async function academyDashboard(identity: EdaIdentity): Promise<AcademyDashboard> {
  const enrollment = await ensureEnrollment(identity);
  const progressRows = await all('SELECT * FROM academy_progress WHERE tenant_id = ? AND user_id = ? ORDER BY updated_at DESC', [identity.tenantId, identity.userId]);
  const submissionRows = await all('SELECT * FROM academy_submissions WHERE tenant_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 50', [identity.tenantId, identity.userId]);
  const capstoneRow = await one('SELECT * FROM academy_capstones WHERE tenant_id = ? AND user_id = ?', [identity.tenantId, identity.userId]);
  const progressItems = progressRows.map(progress);
  const completed = progressItems.filter(item => item.status === 'passed').length;
  const inProgress = progressItems.filter(item => item.status !== 'passed').length;
  const scored = progressItems.filter(item => item.bestScore > 0);
  return {
    enrollment: {
      pathSlug: String(enrollment.path_slug), status: String(enrollment.status),
      diagnosticScore: enrollment.diagnostic_score === null || enrollment.diagnostic_score === undefined ? null : numeric(enrollment.diagnostic_score),
      startedAt: String(enrollment.started_at),
    },
    summary: {
      totalModules: academyLabs.length, completedModules: completed, inProgressModules: inProgress,
      averageScore: scored.length ? Math.round(scored.reduce((sum, item) => sum + item.bestScore, 0) / scored.length) : 0,
      completionPct: Math.round((completed / academyLabs.length) * 100),
    },
    progress: progressItems,
    submissions: submissionRows.map(submission),
    labs: academyLabs,
    paths: academyPaths,
    capstone: capstoneRow ? capstone(capstoneRow) : null,
  };
}

export async function selectAcademyPath(identity: EdaIdentity, pathSlug: string, requestId: string): Promise<void> {
  if (!academyPaths.some(path => path.slug === pathSlug)) throw new Error('Learning path not found');
  await ensureEnrollment(identity);
  await run('UPDATE academy_enrollments SET path_slug = ?, updated_at = ? WHERE tenant_id = ? AND user_id = ?', [pathSlug, now(), identity.tenantId, identity.userId]);
  await audit(identity, 'academy.path.selected', pathSlug, { pathSlug }, requestId);
}

export async function submitAcademyLab(identity: EdaIdentity, input: { labSlug: string; response: string; evidence: string[] }, requestId: string): Promise<AcademySubmission> {
  const lab = getAcademyLab(input.labSlug);
  if (!lab) throw new Error('Academy lab not found');
  await ensureEnrollment(identity);
  const count = await one<{ n: string | number }>('SELECT COUNT(*) AS n FROM academy_submissions WHERE tenant_id = ? AND user_id = ? AND lab_slug = ?', [identity.tenantId, identity.userId, lab.slug]);
  const attempt = numeric(count?.n) + 1;
  const grade = gradeAcademyLab(lab, { response: input.response, evidence: input.evidence });
  const id = randomUUID();
  const timestamp = now();
  await run('INSERT INTO academy_submissions (id, tenant_id, user_id, lab_slug, topic_slug, response_text, evidence_json, grade_json, score, passed, attempt, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [
    id, identity.tenantId, identity.userId, lab.slug, lab.topicSlug, input.response, json(input.evidence), json(grade), grade.score, grade.passed ? 1 : 0, attempt, timestamp,
  ]);
  const existing = await one('SELECT * FROM academy_progress WHERE tenant_id = ? AND user_id = ? AND topic_slug = ?', [identity.tenantId, identity.userId, lab.topicSlug]);
  if (existing) {
    const bestScore = Math.max(numeric(existing.best_score), grade.score);
    const passed = String(existing.status) === 'passed' || grade.passed;
    await run('UPDATE academy_progress SET status = ?, best_score = ?, attempts = ?, completed_at = ?, updated_at = ? WHERE id = ?', [
      passed ? 'passed' : 'needs-review', bestScore, numeric(existing.attempts) + 1,
      passed ? String(existing.completed_at ?? timestamp) : null, timestamp, String(existing.id),
    ]);
  } else {
    await run('INSERT INTO academy_progress (id, tenant_id, user_id, topic_slug, status, best_score, attempts, completed_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [
      randomUUID(), identity.tenantId, identity.userId, lab.topicSlug, grade.passed ? 'passed' : 'needs-review', grade.score, 1, grade.passed ? timestamp : null, timestamp,
    ]);
  }
  await audit(identity, 'academy.lab.submitted', id, { labSlug: lab.slug, topicSlug: lab.topicSlug, attempt, score: grade.score, passed: grade.passed }, requestId);
  return { id, labSlug: lab.slug, topicSlug: lab.topicSlug, response: input.response, evidence: input.evidence, grade, attempt, createdAt: timestamp };
}

export async function submitDiagnostic(identity: EdaIdentity, answers: Record<string, number>, requestId: string) {
  await ensureEnrollment(identity);
  const correct = Object.fromEntries(diagnosticQuestions.map(question => [question.id, question.correctIndex]));
  const grade = gradeDiagnostic(answers, correct);
  const domains = diagnosticQuestions.map(question => ({
    id: question.id, domain: question.domain, correct: answers[question.id] === question.correctIndex, explanation: question.explanation,
  }));
  const result = {
    ...grade,
    recommendedLevel: grade.score >= 80 ? 'Advanced' : grade.score >= 50 ? 'Intermediate' : 'Foundation',
    domains,
  };
  const id = randomUUID();
  await run('INSERT INTO academy_assessments (id, tenant_id, user_id, kind, answers_json, score, result_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [
    id, identity.tenantId, identity.userId, 'diagnostic', json(answers), grade.score, json(result), now(),
  ]);
  await run('UPDATE academy_enrollments SET diagnostic_score = ?, updated_at = ? WHERE tenant_id = ? AND user_id = ?', [grade.score, now(), identity.tenantId, identity.userId]);
  await audit(identity, 'academy.diagnostic.completed', id, { score: grade.score }, requestId);
  return result;
}

function scoreCapstone(input: { specification: string; architecture: string; verificationPlan: string; evidence: string[] }): { score: number; feedback: string } {
  const spec = Math.min(25, Math.round(input.specification.trim().length / 40));
  const architecture = Math.min(25, Math.round(input.architecture.trim().length / 50));
  const verification = Math.min(25, Math.round(input.verificationPlan.trim().length / 50));
  const evidence = Math.min(25, input.evidence.filter(Boolean).length * 5);
  const score = spec + architecture + verification + evidence;
  const gaps = [spec < 18 && 'measurable requirements', architecture < 18 && 'architecture tradeoffs', verification < 18 && 'verification and signoff plan', evidence < 18 && 'at least four primary artifacts'].filter(Boolean);
  return { score, feedback: score >= 75 ? 'Capstone is ready for accountable instructor review.' : `Strengthen ${gaps.join(', ') || 'the engineering evidence'} before requesting approval.` };
}

export async function saveCapstone(identity: EdaIdentity, input: { title?: string; specification: string; architecture: string; verificationPlan: string; evidence: string[]; submit: boolean }, requestId: string): Promise<AcademyCapstone> {
  await ensureEnrollment(identity);
  const result = scoreCapstone(input);
  const existing = await one('SELECT * FROM academy_capstones WHERE tenant_id = ? AND user_id = ?', [identity.tenantId, identity.userId]);
  const timestamp = now();
  const status = input.submit ? (result.score >= 75 ? 'submitted' : 'revision-required') : 'draft';
  const title = input.title?.trim() || capstoneDefinition.title;
  if (existing) {
    await run('UPDATE academy_capstones SET title = ?, specification = ?, architecture = ?, verification_plan = ?, evidence_json = ?, status = ?, score = ?, feedback = ?, updated_at = ? WHERE id = ?', [
      title, input.specification, input.architecture, input.verificationPlan, json(input.evidence), status, result.score, result.feedback, timestamp, String(existing.id),
    ]);
  } else {
    await run('INSERT INTO academy_capstones (id, tenant_id, user_id, title, specification, architecture, verification_plan, evidence_json, status, score, feedback, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [
      randomUUID(), identity.tenantId, identity.userId, title, input.specification, input.architecture, input.verificationPlan, json(input.evidence), status, result.score, result.feedback, timestamp, timestamp,
    ]);
  }
  const saved = await one('SELECT * FROM academy_capstones WHERE tenant_id = ? AND user_id = ?', [identity.tenantId, identity.userId]);
  await audit(identity, input.submit ? 'academy.capstone.submitted' : 'academy.capstone.saved', String(saved!.id), { score: result.score, status }, requestId);
  return capstone(saved!);
}

export async function reviewCapstone(identity: EdaIdentity, input: { id: string; status: 'approved' | 'revision-required'; feedback: string }, requestId: string): Promise<void> {
  const existing = await one('SELECT id FROM academy_capstones WHERE tenant_id = ? AND id = ?', [identity.tenantId, input.id]);
  if (!existing) throw new Error('Capstone not found');
  await run('UPDATE academy_capstones SET status = ?, feedback = ?, updated_at = ? WHERE tenant_id = ? AND id = ?', [input.status, input.feedback, now(), identity.tenantId, input.id]);
  await audit(identity, 'academy.capstone.reviewed', input.id, { status: input.status, feedback: input.feedback }, requestId);
}

export async function saveTutorMessage(identity: EdaIdentity, topicSlug: string, question: string, brief: AcademyTutorBrief, model: string): Promise<void> {
  await run('INSERT INTO academy_tutor_messages (id, tenant_id, user_id, topic_slug, question, response_json, model, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [
    randomUUID(), identity.tenantId, identity.userId, topicSlug, question, json(brief), model, now(),
  ]);
}

export async function instructorDashboard(identity: EdaIdentity) {
  const learners = await all(`SELECT e.user_id, e.path_slug, e.status, e.diagnostic_score, e.started_at,
    COUNT(DISTINCT CASE WHEN p.status = 'passed' THEN p.topic_slug END) AS completed_modules,
    COALESCE(AVG(CASE WHEN p.best_score > 0 THEN p.best_score END), 0) AS average_score
    FROM academy_enrollments e
    LEFT JOIN academy_progress p ON p.tenant_id = e.tenant_id AND p.user_id = e.user_id
    WHERE e.tenant_id = ? GROUP BY e.user_id, e.path_slug, e.status, e.diagnostic_score, e.started_at
    ORDER BY e.started_at DESC`, [identity.tenantId]);
  const capstones = await all('SELECT id, user_id, title, status, score, feedback, updated_at FROM academy_capstones WHERE tenant_id = ? ORDER BY updated_at DESC', [identity.tenantId]);
  const atRisk = await all(`SELECT topic_slug, COUNT(*) AS attempts, AVG(score) AS average_score
    FROM academy_submissions WHERE tenant_id = ? AND passed = 0 GROUP BY topic_slug ORDER BY attempts DESC LIMIT 8`, [identity.tenantId]);
  return {
    learners: learners.map(row => ({ userId: String(row.user_id), pathSlug: String(row.path_slug), status: String(row.status), diagnosticScore: row.diagnostic_score === null ? null : numeric(row.diagnostic_score), completedModules: numeric(row.completed_modules), averageScore: Math.round(numeric(row.average_score)), startedAt: String(row.started_at) })),
    capstones: capstones.map(row => ({ id: String(row.id), userId: String(row.user_id), title: String(row.title), status: String(row.status), score: numeric(row.score), feedback: String(row.feedback), updatedAt: String(row.updated_at) })),
    atRisk: atRisk.map(row => ({ topicSlug: String(row.topic_slug), attempts: numeric(row.attempts), averageScore: Math.round(numeric(row.average_score)) })),
  };
}
