import 'server-only';

import { all } from '@/lib/commercial/database';
import { debugChallenges } from '@/lib/journey/catalog';
import type { JourneyAssessment } from '@/lib/journey/types';
import { academyLabs } from './catalog';
import { hasExecutableLab } from './execution';

export type MasteryLevel = 'not-started' | 'developing' | 'proficient' | 'mastered';

export interface MasteryEvidence {
  gradedLabs: number;
  passedLabs: number;
  challengeFixes: number;
  capstones: number;
}

export interface MasteryTopic {
  id: string;
  title: string;
  pct: number;
  level: MasteryLevel;
  evidence: MasteryEvidence;
}

export interface MasterySummary {
  generatedAt: string;
  overallPct: number;
  topics: MasteryTopic[];
}

export interface MasteryIdentity {
  tenantId: string;
  userId: string;
}

interface TopicAccumulator {
  id: string;
  title: string;
  weight: number;
  executable: boolean;
  graded: Set<string>;
  passed: boolean;
  bestLabScore: number;
  challenges: Set<string>;
  bestJourneyScore: number;
}

function numeric(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function clampPct(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

function levelFor(pct: number): MasteryLevel {
  if (pct <= 0) return 'not-started';
  if (pct < 60) return 'developing';
  if (pct < 85) return 'proficient';
  return 'mastered';
}

function executedGrade(gradeJson: unknown): boolean {
  try {
    const grade = JSON.parse(String(gradeJson)) as { measurements?: { gradingBasis?: unknown } };
    return grade.measurements?.gradingBasis === 'executed-v1';
  } catch {
    return false;
  }
}

function catalogTopics(): Map<string, TopicAccumulator> {
  const topics = new Map<string, TopicAccumulator>();
  for (const lab of academyLabs) {
    if (topics.has(lab.topicSlug)) continue;
    topics.set(lab.topicSlug, {
      id: lab.topicSlug,
      title: lab.title,
      weight: Math.max(1, lab.estimatedMinutes),
      executable: hasExecutableLab(lab),
      graded: new Set(),
      passed: false,
      bestLabScore: 0,
      challenges: new Set(),
      bestJourneyScore: 0,
    });
  }
  return topics;
}

export async function masteryForUser(identity: MasteryIdentity): Promise<MasterySummary> {
  const topics = catalogTopics();

  const submissions = await all<{
    lab_slug: string;
    topic_slug: string;
    score: unknown;
    passed: unknown;
    grade_json: unknown;
  }>('SELECT lab_slug, topic_slug, score, passed, grade_json FROM academy_submissions WHERE tenant_id = ? AND user_id = ?', [
    identity.tenantId,
    identity.userId,
  ]);
  for (const row of submissions) {
    const topic = topics.get(String(row.topic_slug));
    if (!topic) continue;
    if (topic.executable && !executedGrade(row.grade_json)) continue;
    topic.graded.add(String(row.lab_slug));
    topic.bestLabScore = Math.max(topic.bestLabScore, numeric(row.score));
    if (numeric(row.passed) === 1) topic.passed = true;
  }

  const capstones =
    (await all<{ status: unknown }>('SELECT status FROM academy_capstones WHERE tenant_id = ? AND user_id = ?', [
      identity.tenantId,
      identity.userId,
    ])).some(row => String(row.status) === 'approved') ? 1 : 0;

  const challengeLesson = new Map(debugChallenges.map(challenge => [challenge.id, challenge.lesson]));
  const assessments = await all<{ document_json: unknown }>(
    'SELECT document_json FROM design_journey_assessments WHERE tenant_id = ? AND user_id = ?',
    [identity.tenantId, identity.userId]
  );
  for (const row of assessments) {
    let assessment: JourneyAssessment;
    try {
      assessment = JSON.parse(String(row.document_json)) as JourneyAssessment;
    } catch {
      continue;
    }
    if (assessment.userId !== identity.userId || assessment.technicalPassed !== true || !assessment.challengeId) continue;
    const topic = topics.get(challengeLesson.get(assessment.challengeId) ?? '');
    if (!topic) continue;
    topic.challenges.add(assessment.challengeId);
    topic.bestJourneyScore = Math.max(
      topic.bestJourneyScore,
      numeric(assessment.correctness) + numeric(assessment.reproducibility) + numeric(assessment.explanationScore)
    );
  }

  const entries = [...topics.values()];
  const result = entries.map(topic => {
    const pct = clampPct(Math.max(topic.bestLabScore, topic.bestJourneyScore));
    return {
      id: topic.id,
      title: topic.title,
      pct,
      level: levelFor(pct),
      evidence: {
        gradedLabs: topic.graded.size,
        passedLabs: topic.passed ? 1 : 0,
        challengeFixes: topic.challenges.size,
        capstones,
      },
    };
  });
  const totalWeight = entries.reduce((sum, topic) => sum + topic.weight, 0);
  const overallPct = totalWeight
    ? clampPct(result.reduce((sum, topic, index) => sum + topic.pct * entries[index].weight, 0) / totalWeight)
    : 0;

  return { generatedAt: new Date().toISOString(), overallPct, topics: result };
}
