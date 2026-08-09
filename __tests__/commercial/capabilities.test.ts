/** @jest-environment node */

import { existsSync } from 'node:fs';
import path from 'node:path';
import {
  assessPlatformCapabilities,
  CHIP_PLATFORM_CAPABILITIES,
  PLATFORM_CAPABILITY_IDS,
} from '@/lib/commercial/capabilities';
import { CAPABILITY_ACTIONS } from '@/lib/commercial/capabilityActionCatalog';
import { lifecyclePhaseForFeature } from '@/lib/commercial/lifecycle';
import type { DecisionBrief, FeatureRecord, WorkspaceBundle } from '@/lib/commercial/types';

describe('chip platform capability center', () => {
  it('defines all ten requested capability tracks with executable tools and exit criteria', () => {
    expect(CHIP_PLATFORM_CAPABILITIES).toHaveLength(10);
    expect(new Set(CHIP_PLATFORM_CAPABILITIES.map((item) => item.id)).size).toBe(10);
    expect(CHIP_PLATFORM_CAPABILITIES.map((item) => item.id)).toEqual([...PLATFORM_CAPABILITY_IDS]);
    for (const capability of CHIP_PLATFORM_CAPABILITIES) {
      expect(CAPABILITY_ACTIONS[capability.id]).toHaveLength(5);
      expect(capability.recordTypes.length).toBeGreaterThan(0);
      expect(capability.exitCriteria.length).toBeGreaterThan(0);
      expect(capability.lifecyclePhases.length).toBeGreaterThan(0);
      for (const tool of capability.tools) {
        const route = tool.route.split('#')[0];
        expect(existsSync(path.join(process.cwd(), 'app', route, 'page.tsx'))).toBe(true);
      }
    }
    expect(Object.values(CAPABILITY_ACTIONS).flat()).toHaveLength(50);
  });

  it('derives readiness from retained evidence, AI review, and human disposition', () => {
    const record = {
      id: 'record-1',
      projectId: 'project-1',
      feature: 'verification-closure',
      recordType: 'coverage',
      title: 'Coverage closure candidate',
      status: 'active',
      payload: {},
      evidence: ['coverage.rpt'],
      createdAt: '2026-08-09',
    } satisfies FeatureRecord;
    const review = {
      id: 'review-1',
      projectId: 'project-1',
      feature: 'verification-closure',
      headline: 'Coverage exclusions require review',
      humanStatus: 'accepted',
      verdict: 'proceed-with-conditions',
      risk: 'moderate',
      createdAt: '2026-08-09',
    } as DecisionBrief;
    const workspace = { featureRecords: [record], aiReviews: [review] } as WorkspaceBundle;
    const assessments = assessPlatformCapabilities(workspace, 'project-1');
    expect(assessments.find((item) => item.id === 'verification-closure')?.readiness).toBe('human-dispositioned');
    expect(assessments.find((item) => item.id === 'tapeout-release')?.readiness).toBe('not-started');
  });

  it('places each capability review into the appropriate chip lifecycle phase', () => {
    expect(lifecyclePhaseForFeature('verification-closure')).toBe('verification');
    expect(lifecyclePhaseForFeature('power-thermal-signoff')).toBe('signoff');
    expect(lifecyclePhaseForFeature('chiplet-packaging')).toBe('floorplan-pdn');
    expect(lifecyclePhaseForFeature('silicon-yield-feedback')).toBe('silicon');
  });
});
