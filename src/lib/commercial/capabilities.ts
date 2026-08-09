import type { DecisionBrief, FeatureRecord, WorkspaceBundle } from './types';

export const PLATFORM_CAPABILITY_IDS = [
  'verification-closure',
  'ai-ppa-closure',
  'enterprise-integrations',
  'power-thermal-signoff',
  'rtl-ip-management',
  'analog-mixed-signal',
  'chiplet-packaging',
  'silicon-yield-feedback',
  'tapeout-release',
  'resource-cost-optimization',
] as const;

export type PlatformCapabilityId = (typeof PLATFORM_CAPABILITY_IDS)[number];
export type CapabilityReadiness = 'not-started' | 'evidence-captured' | 'ai-reviewed' | 'human-dispositioned';

export interface PlatformCapabilityDefinition {
  id: PlatformCapabilityId;
  title: string;
  summary: string;
  objective: string;
  lifecyclePhases: string[];
  recordTypes: string[];
  outcomes: string[];
  exitCriteria: string[];
  tools: Array<{ label: string; route: string }>;
}

export interface PlatformCapabilityAssessment extends PlatformCapabilityDefinition {
  readiness: CapabilityReadiness;
  records: FeatureRecord[];
  reviews: DecisionBrief[];
  latestRecord?: FeatureRecord;
  latestReview?: DecisionBrief;
}

export const CHIP_PLATFORM_CAPABILITIES: PlatformCapabilityDefinition[] = [
  {
    id: 'verification-closure',
    title: 'Verification Closure Hub',
    summary: 'Unify regressions, coverage, formal proofs, failure clusters, waveforms and requirement traceability.',
    objective:
      'Prove functional intent with reproducible regressions and explicit closure against the verification plan.',
    lifecyclePhases: ['rtl', 'verification'],
    recordTypes: ['regression', 'coverage', 'formal-proof', 'failure-cluster', 'requirement-trace'],
    outcomes: [
      'UVM regression ledger',
      'Functional/code/assertion coverage',
      'Formal proof status',
      'Failure clustering and waveform references',
    ],
    exitCriteria: [
      'All planned regressions pass',
      'Coverage targets close with reviewed exclusions',
      'Formal and CDC/RDC obligations are proven or independently waived',
    ],
    tools: [
      { label: 'Coverage merge', route: '/cov-merge' },
      { label: 'CDC analysis', route: '/cdc' },
      { label: 'Assertion density', route: '/sva-density' },
      { label: 'Failure triage', route: '/log-triage' },
    ],
  },
  {
    id: 'ai-ppa-closure',
    title: 'AI Timing & PPA Closure',
    summary: 'Turn measured timing, power, area and congestion deltas into bounded optimization experiments.',
    objective: 'Recommend and verify timing/PPA experiments without presenting hypotheses as measured closure.',
    lifecyclePhases: ['placement', 'cts', 'route-extraction', 'signoff'],
    recordTypes: [
      'critical-path-review',
      'optimization-candidate',
      'eco-experiment',
      'baseline-comparison',
      'closure-decision',
    ],
    outcomes: [
      'Critical-path root-cause register',
      'Constraint and ECO candidates',
      'Multi-objective Pareto comparisons',
      'Sandbox rerun evidence',
    ],
    exitCriteria: [
      'Every recommendation has a controlled experiment',
      'Baseline and candidate inputs are comparable',
      'Accepted changes remain inside all project guardrails',
    ],
    tools: [
      { label: 'Timing paths', route: '/timing-paths' },
      { label: 'Auto-tune', route: '/autotune' },
      { label: 'PPA tracking', route: '/batch09/cfs/continuous-ppa-tracking-across-commits' },
      { label: 'Run comparison', route: '/workspace/execution/compare' },
    ],
  },
  {
    id: 'enterprise-integrations',
    title: 'Enterprise Integrations',
    summary: 'Govern SCM, issue tracking, notifications, identity, provisioning and customer-managed encryption.',
    objective:
      'Connect enterprise systems through verified, tenant-bound adapters with delivery and activation evidence.',
    lifecyclePhases: ['requirements', 'tapeout'],
    recordTypes: ['scm-connection', 'issue-sync', 'notification-delivery', 'identity-activation', 'kms-verification'],
    outcomes: [
      'GitHub/GitLab status publishing',
      'Jira synchronization',
      'Slack/email delivery receipts',
      'SAML/OIDC and SCIM activation',
      'KMS round-trip verification',
    ],
    exitCriteria: [
      'Credentials remain in the deployment secret store',
      'Inbound events are signature verified',
      'Outbound actions retain provider receipts',
      'Identity and KMS records complete a real round trip',
    ],
    tools: [
      { label: 'Engineering operations', route: '/operations' },
      { label: 'Security administration', route: '/admin/security' },
      { label: 'Audit log', route: '/admin/audit-logs' },
    ],
  },
  {
    id: 'power-thermal-signoff',
    title: 'Power & Thermal Signoff',
    summary: 'Track power intent, DVFS states, activity provenance, thermal limits and EM/IR correlation.',
    objective: 'Close electrical and thermal budgets across every required operating state and physical scenario.',
    lifecyclePhases: ['floorplan-pdn', 'signoff'],
    recordTypes: ['power-intent', 'power-state', 'dynamic-power', 'thermal-scenario', 'em-ir-correlation'],
    outcomes: [
      'UPF/CPF intent register',
      'DVFS and power-state coverage',
      'Dynamic/leakage power evidence',
      'Thermal maps',
      'EM/IR/thermal hotspot correlation',
    ],
    exitCriteria: [
      'Power intent matches RTL and implementation',
      'Activity sources are traceable',
      'Package and cooling limits are respected',
      'Every hotspot has dispositioned evidence',
    ],
    tools: [
      { label: 'Power analysis', route: '/power' },
      { label: 'PDN generator', route: '/pdn' },
      { label: 'IR drop', route: '/ir-drop' },
      { label: 'EM check', route: '/em-check' },
      { label: 'IR×EM hotspots', route: '/rel-hotspot' },
    ],
  },
  {
    id: 'rtl-ip-management',
    title: 'RTL & IP Management',
    summary: 'Qualify reusable IP, dependencies, licenses, vulnerabilities and change impact.',
    objective: 'Maintain a reproducible and policy-compliant RTL/IP bill of materials for the exact design revision.',
    lifecyclePhases: ['technology', 'rtl'],
    recordTypes: ['ip-release', 'dependency-scan', 'license-review', 'vulnerability-review', 'change-impact'],
    outcomes: [
      'Versioned IP catalog',
      'Dependency and license bill of materials',
      'Security findings',
      'PR-level RTL impact',
      'Third-party access policy',
    ],
    exitCriteria: [
      'Every IP has immutable provenance',
      'License and security policy checks pass',
      'Tool/PDK/view compatibility is evidenced',
      'RTL changes have downstream impact results',
    ],
    tools: [
      { label: 'Library registry', route: '/batch09/cfs/marketplace-of-community-design-libraries' },
      { label: 'RTL impact', route: '/batch09/cfs/ai-agent-that-ties-rtl-change-to-downstream-pnr-impact-predi' },
      { label: 'RTL lint', route: '/rtl-lint' },
    ],
  },
  {
    id: 'analog-mixed-signal',
    title: 'Analog/Mixed-Signal Workspace',
    summary: 'Govern SPICE regressions, waveforms, Monte Carlo distributions and extracted-netlist comparisons.',
    objective:
      'Demonstrate circuit behavior and statistical margin across qualified models, corners and extracted views.',
    lifecyclePhases: ['technology', 'signoff'],
    recordTypes: ['spice-regression', 'waveform-measurement', 'monte-carlo', 'pex-comparison', 'analog-closure'],
    outcomes: [
      'SPICE netlist and testbench registry',
      'Waveform measurement index',
      'Monte Carlo yield distributions',
      'Pre/post-layout comparison',
      'Analog closure dashboard',
    ],
    exitCriteria: [
      'Golden provenance is retained',
      'PVT and mismatch coverage meet the plan',
      'Numerical tolerances are explicit',
      'Extracted-view regressions meet margin targets',
    ],
    tools: [
      { label: 'SPICE testbench', route: '/spice-tb' },
      { label: 'SPICE matrix', route: '/operations' },
      { label: 'gm/Id sizing', route: '/gm-id' },
      { label: 'S-parameters', route: '/sparam' },
    ],
  },
  {
    id: 'chiplet-packaging',
    title: 'Chiplet & Advanced Packaging',
    summary: 'Coordinate die partitioning, UCIe links, bump/RDL, interposers, SI/PI, thermal and package economics.',
    objective:
      'Close die-to-die interfaces and package constraints together with silicon floorplan and system budgets.',
    lifecyclePhases: ['architecture', 'floorplan-pdn', 'silicon'],
    recordTypes: ['chiplet-partition', 'die-link', 'bump-rdl-plan', 'package-si-pi', 'package-thermal-cost'],
    outcomes: [
      '2.5D/3D partition plan',
      'UCIe interface budget',
      'Bump/RDL/interposer plan',
      'Package SI/PI evidence',
      'Thermal and cost model',
    ],
    exitCriteria: [
      'Interface bandwidth and latency close',
      'Bump and routing resources are feasible',
      'SI/PI and thermal limits pass',
      'Package assumptions are versioned with the die release',
    ],
    tools: [
      { label: 'Architecture', route: '/architectures' },
      { label: 'Bump/RDL', route: '/bump-rdl' },
      { label: 'Microstrip', route: '/microstrip' },
      { label: 'Cross section', route: '/xsection' },
    ],
  },
  {
    id: 'silicon-yield-feedback',
    title: 'Silicon Bring-Up & Yield Feedback',
    summary: 'Connect wafer, lot, ATE, characterization and failure-analysis evidence back to the design.',
    objective: 'Convert first-silicon and production observations into traceable design, test and process learning.',
    lifecyclePhases: ['silicon'],
    recordTypes: ['bringup', 'wafer-lot', 'test-bin', 'characterization', 'failure-analysis'],
    outcomes: [
      'Bring-up checklist',
      'Wafer/lot yield analytics',
      'Test-bin pareto',
      'RTL-to-silicon comparison',
      'Failure-analysis feedback',
    ],
    exitCriteria: [
      'Results identify lot, wafer, die and test program',
      'Bench and ATE conditions are retained',
      'Failures have accountable dispositions',
      'Learnings link to requirements or design changes',
    ],
    tools: [
      { label: 'Wafer analytics', route: '/wafer' },
      { label: 'IDDQ', route: '/iddq' },
      { label: 'JTAG', route: '/jtag' },
      { label: 'Reliability FIT', route: '/fit' },
    ],
  },
  {
    id: 'tapeout-release',
    title: 'Tapeout Release Manager',
    summary: 'Freeze exact release artifacts, foundry checks, manifests, signatures and accountable approvals.',
    objective: 'Produce an immutable, independently approved release bundle for the exact tapeout candidate.',
    lifecyclePhases: ['physical-verification', 'tapeout'],
    recordTypes: ['foundry-checklist', 'pdk-lock', 'release-manifest', 'streamout-verification', 'release-decision'],
    outcomes: [
      'Foundry checklist',
      'PDK/deck lock',
      'Signed release manifest',
      'GDS/OASIS package verification',
      'Approval ceremony record',
    ],
    exitCriteria: [
      'Artifact hashes reconcile to the reviewed revision',
      'PDK and rule-deck versions are locked',
      'All signoff domains are closed or independently waived',
      'Named authorities approve the immutable package',
    ],
    tools: [
      { label: 'Signoff operations', route: '/operations' },
      { label: 'Layout diff', route: '/layout-diff' },
      { label: 'KLayout', route: '/klayout' },
      { label: 'Lifecycle tapeout gate', route: '/governed-ai/lifecycle#phase-tapeout' },
    ],
  },
  {
    id: 'resource-cost-optimization',
    title: 'Resource & Cost Optimization',
    summary: 'Forecast compute, EDA licenses, queues, storage, budgets and run cancellation opportunities.',
    objective: 'Meet project schedule and evidence obligations while controlling scarce tool and compute capacity.',
    lifecyclePhases: ['requirements', 'verification', 'signoff'],
    recordTypes: ['license-utilization', 'compute-forecast', 'queue-plan', 'budget', 'capacity-decision'],
    outcomes: [
      'License utilization',
      'Compute queue forecast',
      'Cloud-run cost model',
      'Project quota and budget',
      'Capacity recommendation',
    ],
    exitCriteria: [
      'Forecast inputs and rates are versioned',
      'Critical signoff capacity is reserved',
      'Quota actions preserve retention obligations',
      'Cancellations never remove required evidence',
    ],
    tools: [
      { label: 'Governed runs', route: '/workspace/execution' },
      { label: 'Engineering operations', route: '/operations' },
      { label: 'Analytics', route: '/analytics' },
    ],
  },
];

export function assessPlatformCapabilities(
  workspace: WorkspaceBundle,
  projectId: string
): PlatformCapabilityAssessment[] {
  return CHIP_PLATFORM_CAPABILITIES.map((capability) => {
    const records = workspace.featureRecords.filter(
      (record) => record.projectId === projectId && record.feature === capability.id
    );
    const reviews = workspace.aiReviews.filter(
      (review) => review.projectId === projectId && review.feature === capability.id
    );
    const latestRecord = records[0];
    const latestReview = reviews[0];
    const readiness: CapabilityReadiness =
      latestReview?.humanStatus === 'accepted' || latestReview?.humanStatus === 'rejected'
        ? 'human-dispositioned'
        : latestReview
          ? 'ai-reviewed'
          : latestRecord
            ? 'evidence-captured'
            : 'not-started';
    return { ...capability, readiness, records, reviews, latestRecord, latestReview };
  });
}

export function capabilityForId(id: string): PlatformCapabilityDefinition | undefined {
  return CHIP_PLATFORM_CAPABILITIES.find((capability) => capability.id === id);
}
