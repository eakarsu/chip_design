/** @jest-environment node */

import { buildLifecycleChatPrompt, buildLifecycleProfile, CHIP_DESIGN_LIFECYCLE, inferLifecyclePhaseId, lifecyclePhaseForFeature } from '@/lib/commercial/lifecycle';
import type { WorkspaceBundle } from '@/lib/commercial/types';
import { existsSync } from 'node:fs';
import path from 'node:path';

const workspace: WorkspaceBundle = {
  projects: [{
    id: 'project-1', tenantId: 'tenant-1', name: 'Atlas NPU', description: 'Edge inference accelerator',
    repositoryUrl: 'https://github.com/example/atlas', defaultBranch: 'main', topModule: 'atlas_top',
    pdkRef: 'foundry16@4.2', status: 'implementation', createdBy: 'owner', createdAt: '2026-01-01', updatedAt: '2026-01-01',
  }],
  constraints: [{ id: 'constraint-1', projectId: 'project-1', name: 'functional', sdc: 'create_clock -period 1.0 [get_ports clk]', version: 1, active: true, createdAt: '2026-01-01' }],
  corners: [
    { id: 'ss', projectId: 'project-1', constraintSetId: 'constraint-1', name: 'ss', process: 'ss', voltage: 0.72, temperature: 125, libertyRef: 'ss.lib', rcCorner: 'rcworst', active: true },
    { id: 'ff', projectId: 'project-1', constraintSetId: 'constraint-1', name: 'ff', process: 'ff', voltage: 0.88, temperature: -40, libertyRef: 'ff.lib', rcCorner: 'rcbest', active: true },
    { id: 'tt', projectId: 'project-1', constraintSetId: 'constraint-1', name: 'tt', process: 'tt', voltage: 0.8, temperature: 25, libertyRef: 'tt.lib', rcCorner: 'rctyp', active: true },
  ],
  ppaSnapshots: [{ id: 'ppa-1', projectId: 'project-1', commitSha: 'abc123', branch: 'main', message: 'close timing', author: 'owner', areaUm2: 800000, powerMw: 170, wnsNs: 0.02, tnsNs: 0, drcCount: 0, congestionPct: 61, deltas: {}, thresholds: {}, evidence: ['metrics.json'], status: 'pass', createdAt: '2026-01-01' }],
  rtlImpacts: [{ id: 'impact-1', projectId: 'project-1', baseSha: 'base', targetSha: 'abc123', changedModules: ['atlas_top'], timingDeltaNs: 0.01, powerDeltaPct: -5, congestionDeltaPct: -1, drcDelta: 0, affectedPaths: ['cpu/macs'], evidence: ['impact.json'], risk: 'moderate', createdAt: '2026-01-01' }],
  artifacts: [], approvals: [], ecos: [], featureRecords: [], aiReviews: [], storageBackend: 'filesystem', databaseBackend: 'postgres',
};

describe('chip-design lifecycle profile', () => {
  it('defines the complete ordered lifecycle', () => {
    expect(CHIP_DESIGN_LIFECYCLE).toHaveLength(14);
    expect(CHIP_DESIGN_LIFECYCLE.map(phase => phase.order)).toEqual([...Array(14)].map((_, index) => index + 1));
    expect(CHIP_DESIGN_LIFECYCLE[0].id).toBe('requirements');
    expect(CHIP_DESIGN_LIFECYCLE.at(-1)?.id).toBe('silicon');
  });

  it('maps every phase to executable pages that exist in the website', () => {
    for (const phase of CHIP_DESIGN_LIFECYCLE) {
      expect(phase.tools.length).toBeGreaterThan(0);
      for (const tool of phase.tools) {
        expect(existsSync(path.join(process.cwd(), 'app', tool.route, 'page.tsx'))).toBe(true);
      }
    }
  });

  it('calculates progress from retained workspace evidence', () => {
    const profile = buildLifecycleProfile(workspace, 'project-1');
    expect(profile).not.toBeNull();
    expect(profile?.phases.find(phase => phase.id === 'placement')?.status).toBe('complete');
    expect(profile?.phases.find(phase => phase.id === 'verification')?.status).toBe('not-started');
    expect(profile?.phases.find(phase => phase.id === 'technology')?.missingEvidence).toContain('Qualified library/IP bill of materials');
  });

  it('builds a grounded chat handoff with retained and missing evidence', () => {
    const profile = buildLifecycleProfile(workspace, 'project-1')!;
    const prompt = buildLifecycleChatPrompt(profile, 'signoff');
    expect(prompt).toContain('Atlas NPU');
    expect(prompt).toContain('Lifecycle phase 11 of 14');
    expect(prompt).toContain('Active versioned constraint set');
    expect(prompt).toContain('Vector power, SI, IR-drop and EM reports');
    expect(prompt).toContain('Do not claim that missing evidence has been produced');
  });

  it('places chat and governed reviews into the correct lifecycle phases', () => {
    expect(inferLifecyclePhaseId('Investigate a placement congestion hotspot')).toBe('placement');
    expect(inferLifecyclePhaseId('Run DRC and LVS before release')).toBe('physical-verification');
    expect(inferLifecyclePhaseId('Analyze first-silicon yield and ATE failures')).toBe('silicon');
    expect(lifecyclePhaseForFeature('ppa')).toBe('signoff');
    expect(lifecyclePhaseForFeature('rtl-impact')).toBe('rtl');
  });
});
