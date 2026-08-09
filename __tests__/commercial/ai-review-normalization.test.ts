/** @jest-environment node */

jest.mock('@/lib/openrouter', () => ({ generateJSONCompletion: jest.fn() }));

import { createAiDecisionBrief } from '@/lib/commercial/ai';
import { generateJSONCompletion } from '@/lib/openrouter';

describe('AI review normalization', () => {
  const originalTwoPass = process.env.OPENROUTER_CHIP_REVIEW_TWO_PASS;

  beforeEach(() => {
    process.env.OPENROUTER_CHIP_REVIEW_TWO_PASS = 'false';
  });

  afterAll(() => {
    if (originalTwoPass === undefined) delete process.env.OPENROUTER_CHIP_REVIEW_TWO_PASS;
    else process.env.OPENROUTER_CHIP_REVIEW_TWO_PASS = originalTwoPass;
  });

  it('deterministically repairs non-empty provider strings that are shorter than the output schema', async () => {
    jest.mocked(generateJSONCompletion).mockResolvedValueOnce({
      headline: 'No',
      executiveSummary: 'Short',
      risk: 'high',
      confidence: 55,
      verdict: 'hold',
      signoffPosition: 'Hold',
      evidenceQuality: { grade: 'C', score: 45, rationale: 'Weak' },
      findings: [{
        severity: 'high',
        domain: 'x',
        finding: 'The supplied evidence is incomplete.',
        impact: 'Advancement would rely on unverified assumptions.',
        evidenceRefs: ['report://one'],
      }],
      cornerCoverage: { covered: [], missing: ['ss'], assessment: 'Missing' },
      metrics: [{ label: '', value: '' }],
      sections: [
        { title: '', detail: 'Primary evidence remains incomplete.' },
        { title: 'Decision', detail: 'An accountable engineer must review it.' },
      ],
      tradeoffs: ['x'],
      recommendedExperiments: ['x'],
      stopConditions: ['x'],
      dataGaps: ['x'],
      actions: ['x'],
      evidence: ['report://one'],
      assumptions: ['x'],
      humanReviewGates: ['x'],
    });

    const brief = await createAiDecisionBrief({
      projectId: '00000000-0000-4000-8000-000000000001',
      feature: 'ai-design:enterprise-control',
      title: 'Enterprise control review',
      context: { test: true },
      evidence: ['report://one'],
      workspaceContext: { project: { id: '00000000-0000-4000-8000-000000000001' } },
    });

    expect(brief.headline.length).toBeGreaterThanOrEqual(5);
    expect(brief.executiveSummary.length).toBeGreaterThanOrEqual(30);
    expect(brief.signoffPosition.length).toBeGreaterThanOrEqual(20);
    expect(brief.evidenceQuality.rationale.length).toBeGreaterThanOrEqual(20);
    expect(brief.cornerCoverage.assessment.length).toBeGreaterThanOrEqual(20);
    expect(brief.tradeoffs.every((item) => item.length >= 5)).toBe(true);
    expect(brief.stopConditions.every((item) => item.length >= 5)).toBe(true);
    expect(brief.actions.every((item) => item.length >= 5)).toBe(true);
    expect(brief.humanReviewGates.every((item) => item.length >= 5)).toBe(true);
  });
});
