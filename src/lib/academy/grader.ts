import { lintRtl } from '@/lib/tools/rtl_lint';
import { parseSdc } from '@/lib/parsers/sdc';
import { summariseSdc } from '@/lib/tools/sdc_writer';
import { getKnowledgeTopic } from '@/lib/knowledge/catalog';
import type { AcademyGrade, AcademyLabDefinition } from './types';
import { hasExecutableLab, type VerifiedAcademyExecution } from './execution';

export interface LabSubmissionInput {
  response: string;
  evidence: string[];
}

const normalizedWords = (value: string) => new Set(value.toLowerCase().match(/[a-z][a-z0-9_-]{2,}/g) ?? []);

function keywordCoverage(lab: AcademyLabDefinition, response: string): number {
  const topic = getKnowledgeTopic(lab.topicSlug);
  const target = new Set([
    ...(topic?.concepts.map(item => item.term.toLowerCase()) ?? []),
    ...(topic?.metrics.map(item => item.term.toLowerCase()) ?? []),
  ].flatMap(value => value.match(/[a-z][a-z0-9_-]{2,}/g) ?? []));
  const words = normalizedWords(response);
  const found = [...target].filter(word => words.has(word)).length;
  return target.size ? found / target.size : 0;
}

export function gradeAcademyLab(lab: AcademyLabDefinition, input: LabSubmissionInput, executed?: VerifiedAcademyExecution): AcademyGrade {
  if (hasExecutableLab(lab)) {
    const explanationReviewed = executed?.explanationScore !== null && executed?.explanationScore !== undefined;
    const passed = Boolean(executed?.technicalPassed && explanationReviewed && executed!.explanationScore! >= 7);
    const score = (executed?.correctness ?? 0) + (executed?.reproducibility ?? 0) + (executed?.explanationScore ?? 0);
    const criteria = [
      { id: 'correctness', label: 'Executed correctness', description: 'Required reference tests against retained RTL.', points: 60, earned: executed?.correctness ?? 0, passed: Boolean(executed?.technicalPassed), feedback: executed ? 'Score comes from required checks in the verified execution report.' : 'Execute the fixed FIFO simulation suite in a design project.' },
      { id: 'reproducibility', label: 'Verified artifacts', description: 'Input, suite, image and output provenance.', points: 25, earned: executed?.reproducibility ?? 0, passed: executed?.reproducibility === 25, feedback: executed ? 'Artifact hashes were checked against the retained run.' : 'Typed evidence references do not establish an executed result.' },
      { id: 'explanation', label: 'Independent explanation review', description: 'Observed behavior, reasoning and limitations.', points: 15, earned: executed?.explanationScore ?? 0, passed: explanationReviewed && (executed?.explanationScore ?? 0) >= 7, feedback: explanationReviewed ? 'An independent instructor reviewed this run explanation.' : 'Grade the run in the project, then request instructor explanation review.' },
    ];
    return { score, passed, status: passed ? 'passed' : 'needs-review', criteria,
      summary: passed ? `Passed with ${score}/100 from executed tests, verified artifacts and independent explanation review.` : executed?.technicalPassed ? `Technical checks passed (${score}/100 so far). Independent explanation review is required to complete this Academy lab.` : 'An executed, verified reference run is required. Text length, keywords and evidence counts cannot certify this lab.',
      strengths: executed?.technicalPassed ? ['The fixed reference suite passed on the retained source revision.'] : [],
      improvements: criteria.filter(item => !item.passed).map(item => item.feedback),
      measurements: executed ? { gradingBasis: 'executed-v1', runId: executed.runId, revisionId: executed.revisionId, sourceHash: executed.sourceHash, executedChecksPassed: executed.technicalPassed, explanationReviewed } : { gradingBasis: 'executed-v1', executedChecksPassed: false },
    };
  }
  const response = input.response.trim();
  const evidence = input.evidence.map(item => item.trim()).filter(Boolean);
  const lower = response.toLowerCase();
  const coverage = keywordCoverage(lab, response);
  const measurements: Record<string, string | number | boolean> = {
    responseCharacters: response.length,
    evidenceItems: evidence.length,
    conceptCoveragePct: Math.round(coverage * 100),
  };

  let technicalRatio = Math.min(1, response.length / 900) * 0.55 + Math.min(1, coverage / 0.45) * 0.45;
  const strengths: string[] = [];
  const improvements: string[] = [];

  if (lab.editorLanguage === 'systemverilog') {
    const lint = lintRtl(response);
    const hasModule = /\bmodule\b[\s\S]*\bendmodule\b/.test(response);
    const hasSequential = /\balways_ff\b/.test(response);
    const hasHandshake = /\bin_valid\b/.test(response) && /\bin_ready\b/.test(response) && /\bout_valid\b/.test(response) && /\bout_ready\b/.test(response);
    const hasAssertion = /\bassert\s+(?:property|\()/i.test(response);
    technicalRatio = [hasModule, hasSequential, hasHandshake, hasAssertion, lint.errors === 0].filter(Boolean).length / 5;
    Object.assign(measurements, { lintErrors: lint.errors, lintWarnings: lint.warnings, hasSequentialLogic: hasSequential, hasReadyValidContract: hasHandshake, hasAssertions: hasAssertion });
    if (lint.errors) improvements.push(`Resolve ${lint.errors} RTL lint error${lint.errors === 1 ? '' : 's'} before review.`);
    if (!hasAssertion) improvements.push('Add executable protocol, overflow, underflow or ordering assertions.');
  } else if (lab.editorLanguage === 'sdc') {
    const parsed = parseSdc(response);
    const summary = summariseSdc(parsed);
    const hasClockRelationship = summary.clockGroups > 0 || summary.falsePaths > 0 || summary.generatedClocks > 0;
    const checks = [summary.clocks >= 2, summary.ioDelays > 0, summary.clockUncertainties > 0, hasClockRelationship, summary.warnings === 0];
    technicalRatio = checks.filter(Boolean).length / checks.length;
    Object.assign(measurements, { clocks: summary.clocks, ioDelays: summary.ioDelays, clockGroups: summary.clockGroups, uncertainties: summary.clockUncertainties, parserWarnings: summary.warnings });
    if (summary.clocks < 2) improvements.push('Define the required related clocks with traceable periods and sources.');
    if (!hasClockRelationship) improvements.push('Constrain and justify the asynchronous or generated clock relationship.');
  }

  const evidenceRatio = Math.min(1, evidence.length / 3) * 0.6 + (/(report|artifact|commit|sha|run|measurement|version|corner|trace|log)/i.test(`${response}\n${evidence.join('\n')}`) ? 0.4 : 0);
  const reasoningChecks = [/(tradeoff|alternative|compared|versus|vs\.?)/i.test(response), /(assum|risk|limitation|gap)/i.test(response), /(because|therefore|result|observ)/i.test(response)];
  const reasoningRatio = reasoningChecks.filter(Boolean).length / reasoningChecks.length;
  const signoffChecks = [/(acceptance|pass criteria|threshold)/i.test(response), /(stop condition|block|do not proceed)/i.test(response), /(review|approv|owner|signoff)/i.test(response)];
  const signoffRatio = signoffChecks.filter(Boolean).length / signoffChecks.length;

  const ratios: Record<string, number> = { technical: technicalRatio, evidence: evidenceRatio, reasoning: reasoningRatio, signoff: signoffRatio };
  const criteria = lab.rubric.map(criterion => {
    const ratio = ratios[criterion.id] ?? 0;
    const earned = Math.round(criterion.points * ratio);
    return {
      ...criterion,
      earned,
      passed: ratio >= 0.7,
      feedback: ratio >= 0.85 ? 'Strong, review-ready evidence.' : ratio >= 0.7 ? 'Meets the threshold; strengthen traceability where practical.' : `Incomplete: address the ${criterion.label.toLowerCase()} requirements before advancing.`,
    };
  });
  const score = criteria.reduce((sum, criterion) => sum + criterion.earned, 0);
  const passed = score >= 70 && criteria[0].passed && criteria[1].passed;
  if (criteria[0].passed) strengths.push('The technical artifact satisfies the core deterministic checks.');
  if (criteria[1].passed) strengths.push('The submission includes traceable engineering evidence.');
  if (!criteria[1].passed) improvements.push('Add at least three primary evidence references with run, tool or version provenance.');
  if (!criteria[2].passed) improvements.push('Explain assumptions, alternatives and engineering tradeoffs explicitly.');
  if (!criteria[3].passed) improvements.push('Define acceptance thresholds, stop conditions and the accountable reviewer.');

  return {
    score,
    passed,
    status: passed ? 'passed' : 'needs-review',
    summary: passed
      ? `Passed with ${score}/100. The artifact and evidence meet the Academy review threshold.`
      : `Revision required: ${score}/100. Technical completeness and evidence must both reach the passing threshold.`,
    strengths,
    improvements,
    criteria,
    measurements,
  };
}

export function gradeDiagnostic(answers: Record<string, number>, correct: Record<string, number>): { score: number; correctCount: number } {
  const ids = Object.keys(correct);
  const correctCount = ids.filter(id => answers[id] === correct[id]).length;
  return { score: Math.round((correctCount / ids.length) * 100), correctCount };
}
