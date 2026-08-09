import { render, screen } from '@testing-library/react';
import DecisionBriefView from '@/components/commercial/DecisionBriefView';
import type { DecisionBrief } from '@/lib/commercial/types';

const brief: DecisionBrief = {
  id: '00000000-0000-4000-8000-000000000001',
  projectId: '00000000-0000-4000-8000-000000000002',
  feature: 'ppa',
  headline: 'Measured timing evidence requires independent review',
  executiveSummary: 'The retained evidence supports an advisory hold until comparable timing runs are independently reviewed.',
  risk: 'high',
  confidence: 80,
  verdict: 'hold',
  signoffPosition: 'Do not advance until the named timing evidence and scenario coverage are verified.',
  reviewMode: 'single-pass',
  promptVersion: 'test',
  evidenceQuality: { grade: 'C', score: 65, rationale: 'The report is retained, but independent verification remains pending.' },
  findings: [{ severity: 'high', domain: 'STA', finding: 'Timing closure is not demonstrated.', impact: 'The phase gate remains open.', evidenceRefs: ['timing.rpt'] }],
  cornerCoverage: { covered: ['ss'], missing: ['ff'], assessment: 'The active fast corner is not represented in the retained evidence.' },
  metrics: [{ label: 'WNS', value: '-0.10 ns' }],
  sections: [{ title: 'Evidence', detail: 'The timing report is retained with bounded provenance.' }, { title: 'Gate', detail: 'Independent review is required before advancement.' }],
  tradeoffs: ['A rerun adds schedule cost but protects the signoff decision.'],
  recommendedExperiments: ['Repeat the run with the complete active corner set.'],
  stopConditions: ['Stop while any mandatory timing corner remains unverified.'],
  dataGaps: ['Fast-corner timing report is missing.'],
  actions: ['Run and retain a comparable timing analysis.'],
  evidence: ['timing.rpt'],
  assumptions: ['Units are nanoseconds.'],
  humanReviewGates: ['An independent STA owner reviews the evidence.'],
  provider: 'OpenRouter',
  model: 'test-model',
  requestedBy: 'requester-1',
  humanStatus: 'pending',
};

describe('DecisionBriefView independent disposition', () => {
  it('hides disposition controls from the engineer who requested the AI review', () => {
    const onDecision = jest.fn(async () => undefined);
    const { rerender } = render(
      <DecisionBriefView brief={brief} viewerId="requester-1" onDecision={onDecision} />
    );

    expect(screen.getByText(/engineer who requested this AI brief cannot accept or reject it/i)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Accept as advisory input' })).not.toBeInTheDocument();

    rerender(<DecisionBriefView brief={brief} viewerId="reviewer-2" onDecision={onDecision} />);
    expect(screen.getByRole('button', { name: 'Accept as advisory input' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Reject analysis' })).toBeVisible();
  });
});
