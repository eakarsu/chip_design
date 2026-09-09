/** @jest-environment node */

import {
  AI_DESIGN_WORKFLOWS,
  aiDesignFeature,
  aiDesignStepRecordType,
  assessAiDesignWorkflows,
} from '@/lib/commercial/aiDesignWorkflows';
import { capabilityAction } from '@/lib/commercial/capabilityActionCatalog';
import type { DecisionBrief, FeatureRecord, WorkspaceBundle } from '@/lib/commercial/types';

const bundle = (records: FeatureRecord[] = [], reviews: DecisionBrief[] = []) =>
  ({ featureRecords: records, aiReviews: reviews }) as WorkspaceBundle;

const record = (
  id: string,
  feature: string,
  recordType: string,
  createdAt: string,
  status = 'complete'
): FeatureRecord => ({
  id,
  projectId: 'project-1',
  feature,
  recordType,
  title: id,
  status,
  payload: {},
  evidence: [`${id}.json`],
  createdAt,
});

describe('AI design studio workflows', () => {
  it('reimplements seven workflows as seven visible governed steps', () => {
    expect(AI_DESIGN_WORKFLOWS).toHaveLength(7);
    expect(new Set(AI_DESIGN_WORKFLOWS.map((workflow) => workflow.id)).size).toBe(7);
    for (const workflow of AI_DESIGN_WORKFLOWS) {
      expect(workflow.steps).toHaveLength(7);
      expect(workflow.steps.map((item) => item.kind)).toEqual([
        'intent',
        'evidence',
        'tool',
        'ai',
        'experiment',
        'decision',
        'advance',
      ]);
      for (const step of workflow.steps) {
        expect(step.evidence.length).toBeGreaterThan(0);
        expect(step.acceptanceCriteria.length).toBeGreaterThan(0);
        for (const reference of step.actions ?? []) {
          expect(capabilityAction(reference.capabilityId, reference.actionId)).toBeDefined();
        }
      }
    }
  });

  it('does not reuse tool records that predate the latest workflow intent anchor', () => {
    const feature = aiDesignFeature('guided-design-intake');
    const assessments = assessAiDesignWorkflows(
      bundle([
        record('old-ip', 'rtl-ip-management', 'ip-catalog', '2026-08-01T00:00:00.000Z'),
        record('start', feature, aiDesignStepRecordType('design-intent'), '2026-08-02T00:00:00.000Z'),
        record('new-ip', 'rtl-ip-management', 'ip-catalog', '2026-08-03T00:00:00.000Z'),
      ]),
      'project-1'
    );
    const intake = assessments.find((workflow) => workflow.id === 'guided-design-intake')!;
    const qualification = intake.steps.find((step) => step.id === 'qualify-inputs')!;
    expect(intake.startedAt).toBe('2026-08-02T00:00:00.000Z');
    expect(qualification.status).toBe('in-progress');
    expect(qualification.records.map((item) => item.id)).toEqual(['new-ip']);
  });

  it('shows the AI challenge and independent human disposition as separate steps', () => {
    const feature = aiDesignFeature('verification-closure');
    const start = record('start', feature, aiDesignStepRecordType('verification-plan'), '2026-08-02T00:00:00.000Z');
    const review = {
      id: 'review-1',
      projectId: 'project-1',
      feature,
      createdAt: '2026-08-03T00:00:00.000Z',
      humanStatus: 'pending',
    } as DecisionBrief;
    let verification = assessAiDesignWorkflows(bundle([start], [review]), 'project-1').find(
      (workflow) => workflow.id === 'verification-closure'
    )!;
    expect(verification.steps.find((step) => step.kind === 'ai')?.status).toBe('complete');
    expect(verification.steps.find((step) => step.kind === 'decision')?.status).toBe('review-required');

    review.humanStatus = 'accepted';
    review.requestedBy = 'engineer';
    review.humanDecision = { decidedBy: 'independent-admin', decidedAt: '2026-08-04T00:00:00.000Z', rationale: 'Primary reports and bounded experiments were independently reviewed.' };
    verification = assessAiDesignWorkflows(bundle([start], [review]), 'project-1').find(
      (workflow) => workflow.id === 'verification-closure'
    )!;
    expect(verification.steps.find((step) => step.kind === 'decision')?.status).toBe('complete');
  });
});
