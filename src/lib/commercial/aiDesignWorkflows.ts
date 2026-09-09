import type { PlatformCapabilityId } from './capabilities';
import type { DecisionBrief, FeatureRecord, WorkspaceBundle } from './types';

export const AI_DESIGN_WORKFLOW_IDS = [
  'guided-design-intake',
  'verification-closure',
  'ppa-closure',
  'execution-evidence',
  'enterprise-control',
  'tapeout-release',
  'resource-cost',
] as const;

export type AiDesignWorkflowId = (typeof AI_DESIGN_WORKFLOW_IDS)[number];
export type AiDesignStepKind = 'intent' | 'evidence' | 'tool' | 'ai' | 'experiment' | 'decision' | 'advance';
export type AiDesignStepStatus = 'not-started' | 'in-progress' | 'review-required' | 'blocked' | 'complete';

export interface AiDesignActionRef {
  capabilityId: PlatformCapabilityId;
  actionId: string;
}

export interface AiDesignStepDefinition {
  id: string;
  kind: AiDesignStepKind;
  title: string;
  objective: string;
  aiRole: string;
  humanRole: string;
  evidence: string[];
  acceptanceCriteria: string[];
  actions?: AiDesignActionRef[];
}

export interface AiDesignWorkflowDefinition {
  id: AiDesignWorkflowId;
  title: string;
  shortTitle: string;
  summary: string;
  objective: string;
  primaryCapabilityId: PlatformCapabilityId;
  phaseRange: string;
  outcome: string;
  steps: AiDesignStepDefinition[];
}

export interface AiDesignStepAssessment extends AiDesignStepDefinition {
  status: AiDesignStepStatus;
  records: FeatureRecord[];
}

export interface AiDesignWorkflowAssessment extends Omit<AiDesignWorkflowDefinition, 'steps'> {
  steps: AiDesignStepAssessment[];
  progress: number;
  startedAt?: string;
  latestReview?: DecisionBrief;
  currentStep?: AiDesignStepAssessment;
}

const action = (capabilityId: PlatformCapabilityId, actionId: string): AiDesignActionRef => ({
  capabilityId,
  actionId,
});

const step = (
  id: string,
  kind: AiDesignStepKind,
  title: string,
  objective: string,
  aiRole: string,
  humanRole: string,
  evidence: string[],
  acceptanceCriteria: string[],
  actions?: AiDesignActionRef[]
): AiDesignStepDefinition => ({
  id,
  kind,
  title,
  objective,
  aiRole,
  humanRole,
  evidence,
  acceptanceCriteria,
  actions,
});

export const AI_DESIGN_WORKFLOWS: AiDesignWorkflowDefinition[] = [
  {
    id: 'guided-design-intake',
    title: 'AI-guided design intake',
    shortTitle: 'Design intake',
    summary: 'Convert product intent into a governed, reproducible chip-design plan before tools run.',
    objective: 'Freeze measurable requirements, source provenance, interfaces, constraints and decision ownership.',
    primaryCapabilityId: 'rtl-ip-management',
    phaseRange: 'Requirements → RTL readiness',
    outcome: 'Approved design contract and reproducible starting baseline',
    steps: [
      step(
        'design-intent',
        'intent',
        'Capture design intent',
        'Define workload, interfaces, clocks, power states, PPA targets, safety/security requirements and schedule.',
        'Challenge ambiguity, conflicting targets and missing operating scenarios; never invent requirements.',
        'Product owner and chief architect own the requirement baseline.',
        ['Requirements specification', 'Workload definition', 'Interface contracts'],
        ['Every target has a unit and acceptance threshold', 'Assumptions and out-of-scope items are explicit']
      ),
      step(
        'source-baseline',
        'evidence',
        'Lock source and environment baseline',
        'Record RTL, IP, constraints, PDK, tool images and dependency provenance.',
        'Identify incompatible versions, mutable references and missing provenance.',
        'Configuration owner verifies every immutable reference.',
        ['Commit SHA', 'Constraint checksum', 'PDK/deck references', 'Tool image digests'],
        ['All design inputs are immutable', 'The baseline can be reproduced by another engineer']
      ),
      step(
        'qualify-inputs',
        'tool',
        'Qualify RTL and IP inputs',
        'Build the IP catalog and verify version compatibility and provenance.',
        'Rank integration risks from the measured catalog results.',
        'RTL and IP owners resolve rejected or unproven dependencies.',
        ['IP catalog result', 'Compatibility matrix', 'License/provenance record'],
        ['Every IP view has a checksum', 'Compatibility exceptions have owners'],
        [action('rtl-ip-management', 'ip-catalog'), action('rtl-ip-management', 'compatibility-provenance')]
      ),
      step(
        'ai-design-plan',
        'ai',
        'Generate the AI design plan',
        'Create a bounded plan of tool runs, evidence needs, experiments, stop conditions and human gates.',
        'Synthesize the retained intent and baseline into an advisory plan with explicit uncertainty.',
        'Chief architect accepts or rejects the plan; AI cannot freeze requirements.',
        ['Retained intent', 'Qualified input results', 'Named assumptions'],
        ['The plan cites retained evidence', 'Every recommendation has a validation method']
      ),
      step(
        'impact-sandbox',
        'experiment',
        'Run a controlled impact experiment',
        'Measure how the proposed RTL baseline affects downstream implementation risk.',
        'Compare the exact baseline and candidate; separate measurement from causal hypothesis.',
        'Implementation owner verifies comparability and signs the experiment record.',
        ['RTL change-impact result', 'Baseline/candidate identities', 'Affected path list'],
        ['Inputs are comparable', 'Regressions have bounded owners and next actions'],
        [action('rtl-ip-management', 'pr-impact')]
      ),
      step(
        'architecture-decision',
        'decision',
        'Record the architecture decision',
        'Accept, reject or conditionally accept the AI plan with accountable rationale.',
        'Present evidence quality, risks and stop conditions without making the decision.',
        'An independent human records the disposition.',
        ['AI decision brief', 'Human rationale', 'Open-risk owners'],
        ['The reviewer is named', 'Conditions have owners and due evidence']
      ),
      step(
        'intake-release',
        'advance',
        'Release the governed design baseline',
        'Retain the accepted plan and exact inputs as the starting point for implementation.',
        'Summarize remaining uncertainty and downstream monitoring needs.',
        'Program and engineering owners authorize phase entry.',
        ['Accepted design contract', 'Immutable baseline manifest', 'Phase-entry record'],
        ['No rejected decision is advanced', 'The released manifest matches the reviewed baseline']
      ),
    ],
  },
  {
    id: 'verification-closure',
    title: 'Verification closure workflow',
    shortTitle: 'Verification',
    summary: 'Reimplement verification around imported regressions, coverage, proofs, failures and requirements.',
    objective: 'Close functional intent with reproducible primary evidence rather than isolated percentages.',
    primaryCapabilityId: 'verification-closure',
    phaseRange: 'RTL verification → pre-signoff',
    outcome: 'Requirement-traceable verification closure decision',
    steps: [
      step(
        'verification-plan',
        'intent',
        'Freeze the verification plan',
        'Define requirements, test intent, coverage targets, formal obligations, waivers and owners.',
        'Expose requirements without measurable checks and unjustified exclusions.',
        'Verification lead owns plan completeness.',
        ['Verification plan', 'Requirement IDs', 'Coverage targets'],
        ['Every requirement maps to a check', 'Waiver authority is named']
      ),
      step(
        'verification-baseline',
        'evidence',
        'Retain simulator baseline',
        'Lock RTL, testbench, seeds, simulator/version, compile options and waveform retention policy.',
        'Detect non-comparable or irreproducible runs.',
        'DV infrastructure owner verifies replayability.',
        ['RTL/testbench hashes', 'Simulator version', 'Seed and option manifest'],
        ['Failing tests can be replayed', 'Coverage databases identify their source run']
      ),
      step(
        'regression-proof',
        'tool',
        'Execute regression and proof normalization',
        'Ingest UVM results, coverage and formal results into one normalized evidence set.',
        'Reconcile inconsistencies among regressions, coverage and proofs.',
        'Domain owners validate imported report provenance.',
        ['Regression ledger', 'Coverage result', 'Formal property result'],
        ['Required suites executed', 'Coverage/proof inputs match the RTL baseline'],
        [
          action('verification-closure', 'uvm-regression'),
          action('verification-closure', 'coverage-closure'),
          action('verification-closure', 'formal-results'),
        ]
      ),
      step(
        'verification-ai',
        'ai',
        'Run the AI closure challenge',
        'Challenge closure against requirements, exclusions, failure clusters, proofs and missing scenarios.',
        'Prioritize evidence gaps and root-cause experiments without declaring closure.',
        'Verification lead reviews every high-risk finding.',
        ['Normalized verification evidence', 'Approved exclusions', 'Open failure list'],
        ['The brief cites primary evidence', 'Missing scenarios and stop conditions are explicit']
      ),
      step(
        'failure-experiment',
        'experiment',
        'Triage failures and reconcile requirements',
        'Cluster failures, retain representative waveform references and reconcile requirement coverage.',
        'Recommend minimal discriminating reruns and expose untested requirements.',
        'Feature owners resolve clusters and trace gaps.',
        ['Failure clusters', 'Waveform references', 'Requirement trace matrix'],
        ['Every open cluster has an owner', 'Every requirement is covered, proven or waived'],
        [action('verification-closure', 'failure-clustering'), action('verification-closure', 'requirements-trace')]
      ),
      step(
        'verification-decision',
        'decision',
        'Record closure disposition',
        'Accept, reject or conditionally accept the AI closure brief.',
        'Present evidence strength and residual risk only.',
        'Independent verification authority records the decision.',
        ['AI closure brief', 'Reviewer rationale', 'Waiver register'],
        ['No critical open failure is accepted silently', 'Conditions are measurable']
      ),
      step(
        'verification-release',
        'advance',
        'Publish verification closure package',
        'Retain the exact plan, reports, traces, waivers and decision as an immutable package.',
        'Summarize monitoring required after RTL or constraint changes.',
        'Release owner confirms package integrity.',
        ['Closure manifest', 'Evidence checksums', 'Signed disposition'],
        ['Package matches reviewed inputs', 'Change invalidation rules are recorded']
      ),
    ],
  },
  {
    id: 'ppa-closure',
    title: 'AI timing and PPA closure workflow',
    shortTitle: 'Timing & PPA',
    summary: 'Turn measured implementation data into bounded, reproducible optimization experiments.',
    objective: 'Improve timing, power and area without moving regressions into unobserved corners or constraints.',
    primaryCapabilityId: 'ai-ppa-closure',
    phaseRange: 'Synthesis → signoff',
    outcome: 'Measured and human-approved closure candidate',
    steps: [
      step(
        'ppa-guardrails',
        'intent',
        'Define optimization guardrails',
        'Set MCMM scenarios, WNS/TNS, power, area, congestion, DRC and schedule limits.',
        'Identify conflicting objectives and missing tradeoff policy.',
        'Physical-design lead owns guardrails.',
        ['Scenario list', 'PPA thresholds', 'Do-not-touch policy'],
        ['Every metric has a limit', 'Priority and tradeoff rules are explicit']
      ),
      step(
        'ppa-baseline',
        'evidence',
        'Retain comparable baseline',
        'Lock netlist, SDC, libraries, RC corners, PDK, activity and tool configuration.',
        'Reject comparisons that differ in uncontrolled inputs.',
        'STA and implementation owners verify comparability.',
        ['Baseline reports', 'Constraint checksum', 'Tool/PDK digests'],
        ['All active corners are represented', 'Power activity provenance is known']
      ),
      step(
        'path-analysis',
        'tool',
        'Analyze critical paths',
        'Rank negative-slack paths and recurring cells/nets using measured path data.',
        'Generate bounded root-cause hypotheses and flag constraint uncertainty.',
        'STA owner validates path grouping and constraints.',
        ['Critical-path result', 'Path-group context', 'Constraint diagnostics'],
        ['Worst paths are reproducible', 'Unconstrained endpoints are resolved'],
        [action('ai-ppa-closure', 'critical-path-analysis')]
      ),
      step(
        'ppa-ai',
        'ai',
        'Run the AI closure challenge',
        'Propose bounded experiments and reject unsupported ECO claims.',
        'Balance MCMM timing, power, area, congestion and physical risk.',
        'Implementation lead selects experiments; AI cannot apply ECOs.',
        ['Path analysis', 'Comparable baseline', 'Guardrail policy'],
        ['Recommendations identify expected evidence', 'Stop conditions protect every guardrail']
      ),
      step(
        'ppa-experiments',
        'experiment',
        'Execute and compare ECO experiments',
        'Generate constraint/ECO candidates, compute the Pareto frontier and submit a sandbox rerun.',
        'Compare measured candidate results against the exact baseline.',
        'Owners review patches and rerun receipts before acceptance.',
        ['Constraint recommendations', 'ECO candidates', 'Pareto result', 'Governed job receipt'],
        ['No candidate is accepted on prediction alone', 'All guardrails are reevaluated'],
        [
          action('ai-ppa-closure', 'constraint-recommendations'),
          action('ai-ppa-closure', 'eco-recommendations'),
          action('ai-ppa-closure', 'pareto-optimization'),
          action('ai-ppa-closure', 'sandbox-rerun'),
        ]
      ),
      step(
        'ppa-decision',
        'decision',
        'Approve the closure candidate',
        'Record a human disposition on measured improvement and residual risk.',
        'Explain tradeoffs, missing corners and confidence.',
        'STA and physical-design authorities approve independently.',
        ['AI brief', 'Before/after reports', 'Human rationale'],
        ['Candidate is measured', 'Scenario coverage matches the baseline']
      ),
      step(
        'ppa-release',
        'advance',
        'Promote the measured baseline',
        'Retain the accepted patch, reports, manifests and rollback point.',
        'Describe monitoring and invalidation conditions.',
        'Configuration owner updates the governed baseline.',
        ['Accepted ECO', 'New baseline manifest', 'Rollback reference'],
        ['Released hashes match the approved candidate', 'Rejected experiments remain traceable']
      ),
    ],
  },
  {
    id: 'execution-evidence',
    title: 'Execution and evidence workflow',
    shortTitle: 'Execution evidence',
    summary: 'Unify runs, logs, artifacts, provenance, comparisons, approvals and AI findings.',
    objective: 'Make every engineering conclusion reproducible from an exact governed execution record.',
    primaryCapabilityId: 'rtl-ip-management',
    phaseRange: 'All implementation phases',
    outcome: 'Auditable run-to-decision evidence chain',
    steps: [
      step(
        'execution-policy',
        'intent',
        'Define execution policy',
        'Set required inputs, retention, cost approval, retry, cancellation and artifact rules.',
        'Find policy gaps that could lose evidence or allow non-reproducible runs.',
        'Platform and project owners approve policy.',
        ['Run policy', 'Retention schedule', 'Approval thresholds'],
        ['Required evidence cannot be cancelled', 'Retry and idempotency rules are explicit']
      ),
      step(
        'execution-baseline',
        'evidence',
        'Bind revision and environment',
        'Record source, constraints, PDK, tool image, command and dependency identities.',
        'Challenge mutable or incomplete execution manifests.',
        'Run owner verifies the manifest before queueing.',
        ['Input manifest', 'Image digest', 'PDK/constraint hashes'],
        ['Manifest is immutable', 'Another operator can reproduce the request']
      ),
      step(
        'provenance-impact',
        'tool',
        'Measure provenance and change impact',
        'Verify compatibility/provenance and calculate downstream RTL impact.',
        'Identify which conclusions become stale after the change.',
        'RTL and implementation owners validate affected scope.',
        ['Compatibility result', 'RTL impact result', 'Affected artifacts'],
        ['Every affected artifact has an owner', 'Provenance checks pass or are explicitly blocked'],
        [action('rtl-ip-management', 'compatibility-provenance'), action('rtl-ip-management', 'pr-impact')]
      ),
      step(
        'evidence-ai',
        'ai',
        'Audit the evidence chain with AI',
        'Check that conclusions are supported by exact inputs, reports and comparable baselines.',
        'Expose missing provenance, stale artifacts and unsupported causal claims.',
        'Accountable engineer resolves every material gap.',
        ['Run manifest', 'Artifact checksums', 'Normalized metrics'],
        ['AI findings cite retained records', 'Evidence gaps block advancement']
      ),
      step(
        'execution-rerun',
        'experiment',
        'Submit a governed replay',
        'Replay the relevant flow in the bounded queue to prove reproducibility.',
        'Compare replay identity and outputs without hiding nondeterminism.',
        'Run owner reviews the completed job and artifacts.',
        ['Governed job ID', 'Replay manifest', 'Baseline comparison'],
        ['Replay inputs match', 'Differences are explained and retained'],
        [action('ai-ppa-closure', 'sandbox-rerun')]
      ),
      step(
        'evidence-decision',
        'decision',
        'Accept the execution evidence',
        'Record whether the run supports its claimed engineering conclusion.',
        'State confidence and residual evidence risk.',
        'Independent reviewer records the disposition.',
        ['AI evidence brief', 'Run reports', 'Human rationale'],
        ['Reviewer did not author the evidence claim', 'Conditions have verification owners']
      ),
      step(
        'evidence-release',
        'advance',
        'Retain the decision package',
        'Publish the run, logs, artifacts, comparison, brief and decision under one durable identity.',
        'Summarize invalidation triggers for later changes.',
        'Platform owner confirms retention and access controls.',
        ['Decision package', 'Retention receipt', 'Access policy'],
        ['All objects are retrievable', 'Package identity is referenced downstream']
      ),
    ],
  },
  {
    id: 'enterprise-control',
    title: 'Enterprise integration workflow',
    shortTitle: 'Enterprise controls',
    summary: 'Activate real SCM, issue, notification, identity and KMS integrations with verified receipts.',
    objective: 'Prove secure provider round trips, least privilege, delivery and recoverability before activation.',
    primaryCapabilityId: 'enterprise-integrations',
    phaseRange: 'Platform onboarding → operations',
    outcome: 'Human-approved production integration set',
    steps: [
      step(
        'integration-scope',
        'intent',
        'Define integration scope',
        'Name providers, tenants, repositories, projects, recipients, data classes and allowed operations.',
        'Challenge excessive privilege and cross-tenant data exposure.',
        'Security and platform owners approve scope.',
        ['Integration inventory', 'Data classification', 'Least-privilege matrix'],
        ['Every operation has an owner', 'Secrets never enter design records']
      ),
      step(
        'integration-baseline',
        'evidence',
        'Retain provider configuration evidence',
        'Record endpoint identities, key IDs, webhook policy and connection-test receipts without secrets.',
        'Detect unverified endpoints, missing rotation and weak retry policy.',
        'Administrator verifies provider ownership.',
        ['Endpoint fingerprints', 'Secret-store references', 'Webhook policy'],
        ['Production endpoints use HTTPS', 'Credential custody and rotation are documented']
      ),
      step(
        'security-roundtrip',
        'tool',
        'Verify identity and KMS controls',
        'Perform real identity-policy and encryption/rotation verification through configured adapters.',
        'Assess tenant boundaries, MFA/SCIM behavior and encryption proof.',
        'Security owner validates provider receipts.',
        ['Identity adapter receipt', 'KMS verification receipt'],
        ['MFA/SCIM policy matches scope', 'KMS round trip and key identity are proven'],
        [
          action('enterprise-integrations', 'identity-activation'),
          action('enterprise-integrations', 'kms-rotation-verify'),
        ]
      ),
      step(
        'integration-ai',
        'ai',
        'Run the AI integration assurance review',
        'Evaluate least privilege, receipts, retry/idempotency, secret custody and operational gaps.',
        'Separate configured intent from verified provider behavior.',
        'Security reviewer disposition is required.',
        ['Provider receipts', 'Configuration evidence', 'Failure/retry policy'],
        ['No activation claim lacks a receipt', 'Critical controls have accountable owners']
      ),
      step(
        'delivery-roundtrip',
        'experiment',
        'Test business-system delivery',
        'Publish an SCM status, synchronize an issue and deliver bounded notifications.',
        'Correlate request IDs with provider receipts and flag partial delivery.',
        'Service owners verify the target-side result.',
        ['SCM receipt', 'Jira receipt', 'Slack/email receipt'],
        ['Operations are idempotent', 'Delivery appears in the intended tenant only'],
        [
          action('enterprise-integrations', 'scm-status-publish'),
          action('enterprise-integrations', 'jira-sync'),
          action('enterprise-integrations', 'notification-delivery'),
        ]
      ),
      step(
        'integration-decision',
        'decision',
        'Approve production activation',
        'Accept or reject activation based on verified controls and delivery.',
        'Summarize residual risk and rollback conditions.',
        'Security and service owners approve independently.',
        ['AI assurance brief', 'Provider receipts', 'Human rationale'],
        ['No configuration-required action is treated as active', 'Rollback and rotation paths are tested']
      ),
      step(
        'integration-release',
        'advance',
        'Publish the integration runbook',
        'Retain activation state, owners, receipts, rotation schedule and incident procedures.',
        'Identify future evidence-expiry dates.',
        'Operations owner assumes service accountability.',
        ['Activation manifest', 'Runbook', 'Rotation calendar'],
        ['Runbook contains no secrets', 'Evidence expiry is monitored']
      ),
    ],
  },
  {
    id: 'tapeout-release',
    title: 'Tapeout release workflow',
    shortTitle: 'Tapeout release',
    summary: 'Reimplement tapeout as an immutable, independently approved release ceremony.',
    objective: 'Reconcile exact design hashes, locked decks, signoff evidence, stream files and named approvals.',
    primaryCapabilityId: 'tapeout-release',
    phaseRange: 'Signoff → foundry handoff',
    outcome: 'Signed, immutable and accountable tapeout bundle',
    steps: [
      step(
        'release-scope',
        'intent',
        'Freeze release scope and authorities',
        'Name top cells, deliverables, foundry checklist, required signoff domains and independent approvers.',
        'Expose missing authority, deliverables or ambiguous waiver policy.',
        'Tapeout manager owns scope; signoff owners own their domains.',
        ['Foundry checklist', 'Deliverable inventory', 'Approval matrix'],
        ['Every checklist item has evidence and an owner', 'AI has no approval authority']
      ),
      step(
        'release-baseline',
        'evidence',
        'Lock PDK, decks and design baseline',
        'Retain exact RTL/netlist/layout, PDK, rule-deck, library and tool identities.',
        'Reject mutable tags and inconsistent signoff inputs.',
        'Configuration owner verifies every digest.',
        ['Design manifest', 'PDK/deck lock', 'Tool/library hashes'],
        ['All signoff runs reference the locked baseline', 'Exceptions are independently waived']
      ),
      step(
        'release-checklist',
        'tool',
        'Reconcile the foundry checklist',
        'Execute checklist completeness and PDK/deck lock verification.',
        'Flag missing, stale or mismatched release evidence.',
        'Tapeout manager resolves checklist blockers.',
        ['Checklist result', 'Lock verification result'],
        ['No required item is merely asserted', 'Deck versions match foundry requirements'],
        [action('tapeout-release', 'foundry-checklist'), action('tapeout-release', 'pdk-deck-lock')]
      ),
      step(
        'tapeout-ai',
        'ai',
        'Run the independent AI release challenge',
        'Cross-check evidence coverage, waivers, hashes, stream verification and approval separation.',
        'Issue an advisory hold/proceed-with-conditions position only.',
        'Every signoff owner reviews findings in their domain.',
        ['Locked baseline', 'Checklist evidence', 'Waiver register'],
        ['Missing primary evidence blocks release', 'AI does not authorize tapeout']
      ),
      step(
        'stream-verification',
        'experiment',
        'Verify and sign the release bundle',
        'Verify GDS/OASIS hash and size, canonicalize the manifest and create the deployment-key signature.',
        'Detect mismatched stream artifacts and unsigned manifests.',
        'Release engineer verifies signature with an independently distributed public key.',
        ['Stream verification', 'Signed manifest', 'Public-key verification receipt'],
        ['All stream files match expected hashes', 'Manifest signature is independently verified'],
        [action('tapeout-release', 'gds-oasis-verify'), action('tapeout-release', 'signed-manifest')]
      ),
      step(
        'tapeout-decision',
        'decision',
        'Record independent tapeout approvals',
        'Collect accountable dispositions after the AI challenge and stream verification.',
        'Present unresolved evidence and stop conditions.',
        'Named domain authorities make the release decision.',
        ['AI release brief', 'Domain approvals', 'Final waiver register'],
        ['Approvers are independent where required', 'Rejected or pending approval blocks release']
      ),
      step(
        'release-ceremony',
        'advance',
        'Execute the immutable release ceremony',
        'Verify approvals/signature and publish the final release identity and rollback package.',
        'Summarize handoff risk without claiming foundry acceptance.',
        'Tapeout manager performs the ceremony.',
        ['Release ceremony result', 'Immutable bundle URI', 'Foundry handoff receipt'],
        ['Bundle matches approved manifest', 'Release cannot be silently mutated'],
        [action('tapeout-release', 'release-ceremony')]
      ),
    ],
  },
  {
    id: 'resource-cost',
    title: 'Resource and cost workflow',
    shortTitle: 'Resource & cost',
    summary: 'Connect license, queue, cloud-cost and budget evidence to safe capacity decisions.',
    objective: 'Protect release-critical evidence while forecasting capacity, schedule and spend.',
    primaryCapabilityId: 'resource-cost-optimization',
    phaseRange: 'Planning → continuous operations',
    outcome: 'Evidence-aware capacity and budget decision',
    steps: [
      step(
        'resource-policy',
        'intent',
        'Define resource policy',
        'Set budgets, quotas, priority classes, protected evidence jobs, rates and schedule objectives.',
        'Identify policies that could cancel signoff evidence or hide full cost.',
        'Program and infrastructure owners approve policy.',
        ['Budget baseline', 'Priority policy', 'Protected-job rules'],
        ['Rates and quotas are versioned', 'Release-critical work is protected']
      ),
      step(
        'resource-baseline',
        'evidence',
        'Retain telemetry baseline',
        'Record scheduler, license server, cloud rate, storage and queue observation windows.',
        'Expose stale, sampled or incomplete telemetry.',
        'Infrastructure owner validates collection scope.',
        ['License telemetry', 'Queue history', 'Rate card'],
        ['Observation window is representative', 'Telemetry source and units are known']
      ),
      step(
        'utilization-forecast',
        'tool',
        'Analyze utilization and queue demand',
        'Calculate license utilization/denials and forecast compute queues.',
        'Highlight capacity constraints and forecast uncertainty.',
        'EDA infrastructure owner validates anomalies.',
        ['License analysis', 'Queue forecast'],
        ['Peak denials are explained', 'Forecast horizon matches the decision'],
        [
          action('resource-cost-optimization', 'license-utilization'),
          action('resource-cost-optimization', 'queue-forecast'),
        ]
      ),
      step(
        'resource-ai',
        'ai',
        'Run the AI capacity challenge',
        'Balance cost, schedule, retention and evidence criticality.',
        'Recommend bounded capacity actions without cancelling required evidence.',
        'Program owner selects actions and risk tolerance.',
        ['Telemetry baseline', 'Utilization result', 'Queue forecast'],
        ['Recommendations state uncertainty', 'Protected work remains protected']
      ),
      step(
        'cost-capacity-experiment',
        'experiment',
        'Model cost, budget and capacity actions',
        'Estimate cloud cost, test budget/quota headroom and compute a safe run/defer plan.',
        'Compare options against schedule and evidence obligations.',
        'Infrastructure and finance owners validate rates and action safety.',
        ['Cost estimate', 'Budget/quota result', 'Capacity recommendation'],
        ['No cancellation removes required evidence', 'Cost inputs and rates are retained'],
        [
          action('resource-cost-optimization', 'cloud-cost'),
          action('resource-cost-optimization', 'budget-quota'),
          action('resource-cost-optimization', 'capacity-recommendation'),
        ]
      ),
      step(
        'resource-decision',
        'decision',
        'Approve the capacity plan',
        'Record accepted reservations, deferrals, cancellations and budget actions.',
        'Summarize cost/schedule tradeoffs and residual risk.',
        'Program and infrastructure owners approve.',
        ['AI capacity brief', 'Action list', 'Human rationale'],
        ['Every cancellation is auditable', 'Schedule risk has an owner']
      ),
      step(
        'resource-release',
        'advance',
        'Publish and monitor the operating plan',
        'Retain the approved plan, thresholds and reevaluation triggers.',
        'Identify drift and evidence-expiry signals.',
        'Operations owner monitors and reopens the decision when thresholds move.',
        ['Approved capacity plan', 'Monitoring thresholds', 'Reevaluation schedule'],
        ['Threshold alerts are active', 'Plan points to its telemetry baseline']
      ),
    ],
  },
];

export function aiDesignFeature(workflowId: AiDesignWorkflowId): string {
  return `ai-design:${workflowId}`;
}

export function aiDesignStepRecordType(stepId: string): string {
  return `ai-design-step:${stepId}`;
}

export function aiDesignWorkflow(id: string): AiDesignWorkflowDefinition | undefined {
  return AI_DESIGN_WORKFLOWS.find((workflow) => workflow.id === id);
}

function latestRecord(records: FeatureRecord[], feature: string, recordType: string): FeatureRecord | undefined {
  return records.filter((record) => record.feature === feature && record.recordType === recordType)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}

export function workflowPrerequisiteIds(steps: AiDesignStepAssessment[], review?: DecisionBrief): string[] {
  return [...new Set([...steps.filter((step) => step.kind !== 'advance').flatMap((step) => step.records.map((record) => record.id)), ...(review?.id ? [review.id] : [])])].sort();
}

export function assessAiDesignWorkflows(workspace: WorkspaceBundle, projectId: string): AiDesignWorkflowAssessment[] {
  const projectRecords = workspace.featureRecords.filter((record) => record.projectId === projectId);
  const projectReviews = workspace.aiReviews.filter((review) => review.projectId === projectId);

  return AI_DESIGN_WORKFLOWS.map((workflow) => {
    const feature = aiDesignFeature(workflow.id);
    const firstStep = workflow.steps[0];
    const startRecord = latestRecord(projectRecords, feature, aiDesignStepRecordType(firstStep.id));
    const startedAt = startRecord?.createdAt;
    const workflowRecords = startedAt
      ? projectRecords.filter((record) => record.createdAt >= startedAt)
      : projectRecords.filter(
          (record) => record.feature === feature && record.recordType === aiDesignStepRecordType(firstStep.id)
        );
    const latestReview = startedAt
      ? projectReviews.filter((review) => review.feature === feature && (review.createdAt ?? '') >= startedAt)
          .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))[0]
      : undefined;
    const steps = workflow.steps.map<AiDesignStepAssessment>((definition) => {
      const manualRecord = latestRecord(workflowRecords, feature, aiDesignStepRecordType(definition.id));
      const actionRecords = (definition.actions ?? []).flatMap((reference) => {
        const record = latestRecord(workflowRecords, reference.capabilityId, reference.actionId);
        return record ? [record] : [];
      });
      let status: AiDesignStepStatus = 'not-started';
      if (definition.kind === 'ai') {
        status = latestReview ? 'complete' : 'not-started';
      } else if (definition.kind === 'decision') {
        status = latestReview
          ? latestReview.humanStatus === 'accepted' && Boolean(latestReview.humanDecision?.decidedBy && latestReview.requestedBy &&
              latestReview.humanDecision.decidedBy !== latestReview.requestedBy && latestReview.humanDecision.rationale.trim())
            ? 'complete'
            : latestReview.humanStatus === 'rejected'
              ? 'blocked'
              : 'review-required'
          : 'not-started';
      } else if (definition.actions?.length) {
        const statuses = actionRecords.map((record) => record.status);
        status = statuses.some((value) => value === 'blocked' || value === 'configuration-required')
          ? 'blocked'
          : actionRecords.length < definition.actions.length
            ? actionRecords.length
              ? 'in-progress'
              : 'not-started'
            : statuses.some((value) => value !== 'completed')
              ? 'in-progress'
              : 'complete';
      } else if (manualRecord) {
        status = manualRecord.status === 'complete' ? 'complete' : manualRecord.status === 'blocked' ? 'blocked' : 'in-progress';
      }
      return {
        ...definition,
        status,
        records: manualRecord ? [manualRecord, ...actionRecords] : actionRecords,
      };
    });
    const advance = steps.find((step) => step.kind === 'advance')!;
    if (advance.status === 'complete') {
      const retained = advance.records[0];
      const prerequisites = workflowPrerequisiteIds(steps, latestReview);
      if (steps.some((step) => step.kind !== 'advance' && step.status !== 'complete') ||
          retained?.payload.workflowStartId !== startRecord?.id ||
          retained?.payload.reviewId !== latestReview?.id ||
          JSON.stringify(retained?.payload.prerequisiteIds) !== JSON.stringify(prerequisites) ||
          (latestReview?.humanDecision?.decidedAt ?? '') > retained.createdAt) advance.status = 'blocked';
    }
    const completed = steps.filter((item) => item.status === 'complete').length;
    return {
      ...workflow,
      steps,
      progress: Math.round((completed / steps.length) * 100),
      startedAt,
      latestReview,
      currentStep: steps.find((item) => item.status !== 'complete'),
    };
  });
}
