import { challengeDescriptions, journeyTemplate } from './catalog';
import type { JourneyAssessment, JourneyRun, TemplateId } from './types';

export function adaptivePractice(templateId: TemplateId, runs: JourneyRun[], assessments: JourneyAssessment[]) {
  const solved = new Set(
    assessments.filter((item) => item.technicalPassed && item.challengeId).map((item) => item.challengeId)
  );
  const attempts = new Map<string, number>();
  for (const item of runs)
    if (item.challengeId && item.purpose === 'lab')
      attempts.set(item.challengeId, (attempts.get(item.challengeId) ?? 0) + 1);
  const failure = runs
    .find((item) => item.purpose === 'lab' && item.kind === 'simulation')
    ?.report?.checks.find((item) => item.status !== 'passed');
  const domain = failure?.requirementId === 'clock' ? 'constraints' : failure?.requirementId;
  const challenges = challengeDescriptions
    .filter((item) => item.templateId === templateId)
    .map((item) => ({
      ...item,
      solved: solved.has(item.id),
      attempts: attempts.get(item.id) ?? 0,
      recommended:
        !solved.has(item.id) && item.prerequisites.every((id) => solved.has(id)) && (!domain || item.domain === domain),
      prerequisitesMet: item.prerequisites.every((id) => solved.has(id)),
    }));
  const recommendation =
    challenges.find((item) => item.recommended) ?? challenges.find((item) => !item.solved && item.prerequisitesMet);
  return {
    challenges,
    lesson: recommendation?.lesson ?? journeyTemplate(templateId).lesson,
    reason: failure
      ? `Review ${failure.name}: ${failure.message.slice(0, 280)}`
      : recommendation
        ? `Practice ${recommendation.domain} after the skills already demonstrated.`
        : 'All available challenges for this design have executed successfully. Extend the contract or choose another project.',
  };
}
