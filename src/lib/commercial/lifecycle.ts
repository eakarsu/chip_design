import type { WorkspaceArtifact, WorkspaceBundle, WorkspaceProject } from './types';

export type LifecycleStatus = 'complete' | 'in-progress' | 'not-started';

export interface LifecyclePhaseDefinition {
  id: string;
  order: number;
  title: string;
  discipline: string;
  objective: string;
  requiredInputs: string[];
  deliverables: string[];
  gate: string;
  owners: string[];
  route: string;
  tools: Array<{ label: string; route: string; purpose: string }>;
}

export interface LifecyclePhaseAssessment extends LifecyclePhaseDefinition {
  status: LifecycleStatus;
  progress: number;
  completedEvidence: string[];
  missingEvidence: string[];
}

export interface LifecycleProfile {
  project: WorkspaceProject;
  phases: LifecyclePhaseAssessment[];
  overallProgress: number;
  completeCount: number;
  inProgressCount: number;
  notStartedCount: number;
}

export const CHIP_DESIGN_LIFECYCLE: LifecyclePhaseDefinition[] = [
  {
    id: 'requirements', order: 1, title: 'Product requirements & acceptance criteria', discipline: 'Product / Systems',
    objective: 'Translate the product intent into measurable functionality, interfaces, PPA, safety, security, reliability and schedule targets.',
    requiredInputs: ['Product use cases', 'Business and schedule constraints', 'Regulatory and reliability obligations'],
    deliverables: ['Versioned product specification', 'Requirements traceability matrix', 'Quantified acceptance criteria'],
    gate: 'Every requirement has an owner, verification method and measurable pass/fail threshold.', owners: ['Product owner', 'System architect', 'Verification lead'], route: '/governed-ai/lifecycle#phase-requirements',
    tools: [{ label: 'Architecture catalog', route: '/architectures', purpose: 'Select the implementation architecture that satisfies the requirements.' }, { label: 'SRAM planner', route: '/sram-planner', purpose: 'Validate memory capacity assumptions against the product targets.' }],
  },
  {
    id: 'architecture', order: 2, title: 'Architecture & partitioning', discipline: 'System Architecture',
    objective: 'Define compute, memory, interconnect, interface, clock, reset, security and power-domain boundaries.',
    requiredInputs: ['Approved product specification', 'Workload and bandwidth models', 'PPA budget'],
    deliverables: ['Architecture specification', 'Block and interface contracts', 'Clock/reset/power architecture', 'Performance model'],
    gate: 'Architecture closes the workload, bandwidth, latency and PPA budgets with documented assumptions.', owners: ['Chief architect', 'Performance lead', 'Power architect'], route: '/architectures',
    tools: [{ label: 'Architecture designer', route: '/architectures', purpose: 'Evaluate and select a concrete chip architecture.' }, { label: 'SRAM planner', route: '/sram-planner', purpose: 'Size and organize on-chip memory.' }, { label: 'NoC / flow analysis', route: '/flow', purpose: 'Run the end-to-end design-flow model.' }],
  },
  {
    id: 'technology', order: 3, title: 'PDK, IP & library qualification', discipline: 'Technology Enablement',
    objective: 'Qualify the process, standard cells, memories, interfaces, Liberty models and extraction corners before implementation.',
    requiredInputs: ['Process-node target', 'IP requirements', 'Operating voltage and temperature envelope'],
    deliverables: ['Qualified PDK release', 'Approved IP/library bill of materials', 'PVT and RC corner matrix'],
    gate: 'All implementation and signoff views are versioned, licensed, compatible and reproducible.', owners: ['Technology lead', 'Library/IP lead', 'CAD lead'], route: '/batch09/cfs/marketplace-of-community-design-libraries',
    tools: [{ label: 'Library registry', route: '/batch09/cfs/marketplace-of-community-design-libraries', purpose: 'Qualify and govern reusable design libraries.' }, { label: 'Liberty analysis', route: '/liberty', purpose: 'Inspect timing and power library views.' }, { label: 'LEF inspection', route: '/library', purpose: 'Inspect physical-cell and macro library data.' }],
  },
  {
    id: 'rtl', order: 4, title: 'RTL design & integration', discipline: 'Front-End Design',
    objective: 'Implement synthesizable, configurable and traceable RTL that satisfies the architectural contracts.',
    requiredInputs: ['Architecture and interface specifications', 'Coding and lint rules', 'Power and reset intent'],
    deliverables: ['Version-controlled RTL', 'Generated IP configuration', 'Lint-clean integration build'],
    gate: 'RTL builds reproducibly with no unwaived critical lint, reset, clock or integration failures.', owners: ['RTL lead', 'IP owners', 'Integration lead'], route: '/batch09/cfs/ai-agent-that-ties-rtl-change-to-downstream-pnr-impact-predi',
    tools: [{ label: 'RTL impact review', route: '/batch09/cfs/ai-agent-that-ties-rtl-change-to-downstream-pnr-impact-predi', purpose: 'Tie RTL changes to timing, power, congestion and DRC impact.' }, { label: 'RTL lint', route: '/rtl-lint', purpose: 'Run synthesizability and quality checks.' }, { label: 'Synthesis graph', route: '/synth-graph', purpose: 'Inspect the synthesized logic structure.' }],
  },
  {
    id: 'verification', order: 5, title: 'Functional verification & CDC/RDC', discipline: 'Design Verification',
    objective: 'Prove functional intent across simulation, formal, coverage, clock-domain and reset-domain verification.',
    requiredInputs: ['Traceable requirements', 'RTL and interface assertions', 'Verification plan'],
    deliverables: ['Regression results', 'Coverage closure', 'Formal proofs', 'CDC/RDC waiver set'],
    gate: 'All planned tests pass, coverage targets close and every CDC/RDC issue is fixed or formally waived.', owners: ['Verification lead', 'Formal lead', 'CDC/RDC owner'], route: '/cdc',
    tools: [{ label: 'CDC analyzer', route: '/cdc', purpose: 'Analyze asynchronous clock crossings and synchronizers.' }, { label: 'Coverage merge', route: '/cov-merge', purpose: 'Merge regression coverage and identify holes.' }, { label: 'Stimulus generator', route: '/stim-gen', purpose: 'Generate targeted verification stimulus.' }, { label: 'Assertion density', route: '/sva-density', purpose: 'Assess assertion coverage by design area.' }],
  },
  {
    id: 'synthesis-dft', order: 6, title: 'Synthesis, DFT & equivalence', discipline: 'Implementation / Test',
    objective: 'Produce a timing-aware netlist, insert test structures and prove logical equivalence to RTL.',
    requiredInputs: ['Qualified RTL', 'Versioned SDC', 'Liberty views', 'DFT architecture'],
    deliverables: ['Synthesized netlist', 'QoR reports', 'LEC result', 'Scan/ATPG/MBIST evidence'],
    gate: 'Equivalence passes, synthesis guardrails hold and test coverage meets the product target.', owners: ['Synthesis lead', 'DFT lead', 'Formal equivalence owner'], route: '/synth-graph',
    tools: [{ label: 'Synthesis graph', route: '/synth-graph', purpose: 'Run and inspect synthesis transformations.' }, { label: 'Scan stitch', route: '/scan-stitch', purpose: 'Build and validate scan chains.' }, { label: 'ATPG', route: '/atpg', purpose: 'Generate patterns and measure fault coverage.' }, { label: 'MBIST', route: '/mbist', purpose: 'Plan and verify memory built-in self-test.' }],
  },
  {
    id: 'floorplan-pdn', order: 7, title: 'Floorplan, power intent & PDN', discipline: 'Physical Design',
    objective: 'Establish die/core geometry, macro topology, UPF intent, voltage areas, IO plan and power-delivery network.',
    requiredInputs: ['Netlist and hierarchy', 'Macro/IP abstracts', 'Package/IO constraints', 'Power-domain specification'],
    deliverables: ['Approved floorplan', 'UPF and voltage areas', 'PDN strategy', 'Early congestion/IR assessment'],
    gate: 'Area, utilization, macro channels, IO reachability and early power integrity meet guardrails.', owners: ['Physical-design lead', 'Power-integrity lead', 'Package/IO lead'], route: '/floorplan',
    tools: [{ label: 'Floorplan', route: '/floorplan', purpose: 'Create and evaluate die/core and macro placement.' }, { label: 'PDN generator', route: '/pdn', purpose: 'Generate and inspect the power-delivery network.' }, { label: 'Pin assignment', route: '/pin-assignment', purpose: 'Optimize IO and block pin locations.' }],
  },
  {
    id: 'placement', order: 8, title: 'Placement & optimization', discipline: 'Physical Design',
    objective: 'Place and legalize cells while optimizing timing, congestion, power and routability.',
    requiredInputs: ['Approved floorplan', 'Netlist and constraints', 'Physical library views'],
    deliverables: ['Legal placement database', 'Pre-CTS timing report', 'Congestion and utilization maps'],
    gate: 'Placement is legal and pre-CTS timing/congestion remain inside project thresholds.', owners: ['Placement owner', 'Timing owner', 'Congestion owner'], route: '/flow',
    tools: [{ label: 'Implementation flow', route: '/flow', purpose: 'Run placement and optimization stages.' }, { label: 'Congestion map', route: '/congestion-map', purpose: 'Inspect spatial routing pressure.' }, { label: 'Placement comparison', route: '/compare', purpose: 'Compare candidate placement outcomes.' }],
  },
  {
    id: 'cts', order: 9, title: 'Clock-tree synthesis', discipline: 'Physical Design / Timing',
    objective: 'Build robust clock networks with controlled skew, latency, pulse width, power and test-mode behavior.',
    requiredInputs: ['Clock definitions and exceptions', 'Placed design', 'Clock-cell and variation models'],
    deliverables: ['CTS database', 'Clock skew/latency report', 'Pulse-width and gating checks'],
    gate: 'Every functional and test clock meets skew, latency, transition, gating and pulse-width limits.', owners: ['CTS owner', 'STA lead', 'DFT lead'], route: '/cts',
    tools: [{ label: 'CTS workbench', route: '/cts', purpose: 'Build and analyze the clock distribution network.' }, { label: 'Timing analysis', route: '/timing', purpose: 'Evaluate timing after CTS.' }, { label: 'Slack histogram', route: '/slack-histogram', purpose: 'Inspect path-slack distribution and outliers.' }],
  },
  {
    id: 'route-extraction', order: 10, title: 'Routing & parasitic extraction', discipline: 'Physical Design',
    objective: 'Complete signal routing, resolve routing violations and extract signoff-quality parasitics.',
    requiredInputs: ['CTS database', 'Routing technology rules', 'SI and antenna constraints'],
    deliverables: ['Routed DEF/database', 'SPEF/parasitics', 'Antenna and routing reports'],
    gate: 'Routing is complete, reproducible and suitable for signoff extraction with no unresolved critical violations.', owners: ['Routing owner', 'Extraction owner', 'Physical-verification owner'], route: '/flow',
    tools: [{ label: 'Routing flow', route: '/flow', purpose: 'Execute routing and extraction stages.' }, { label: 'Wire-length analysis', route: '/wire-length', purpose: 'Measure routing length and topology.' }, { label: 'Antenna analysis', route: '/antennas', purpose: 'Detect process-antenna exposure.' }],
  },
  {
    id: 'signoff', order: 11, title: 'MCMM timing, power, SI, IR & EM signoff', discipline: 'Signoff Engineering',
    objective: 'Close setup, hold, power, signal integrity, voltage drop and electromigration across all required scenarios.',
    requiredInputs: ['Routed netlist and parasitics', 'Approved constraints', 'PVT/RC scenarios', 'Activity evidence'],
    deliverables: ['MCMM STA reports', 'Vector-based power evidence', 'SI/noise results', 'Static/dynamic IR and EM results'],
    gate: 'All signoff scenarios pass approved thresholds or have accountable, documented waivers.', owners: ['STA lead', 'Power lead', 'SI lead', 'IR/EM lead'], route: '/batch09/cfs/continuous-ppa-tracking-across-commits',
    tools: [{ label: 'Continuous PPA', route: '/batch09/cfs/continuous-ppa-tracking-across-commits', purpose: 'Track signoff metrics and regressions across commits.' }, { label: 'Timing paths', route: '/timing-paths', purpose: 'Inspect critical setup and hold paths.' }, { label: 'Power analysis', route: '/power', purpose: 'Analyze dynamic and leakage power.' }, { label: 'IR drop', route: '/ir-drop', purpose: 'Analyze voltage-drop risk.' }, { label: 'EM check', route: '/em-check', purpose: 'Check electromigration limits.' }],
  },
  {
    id: 'physical-verification', order: 12, title: 'Physical verification', discipline: 'Physical Verification',
    objective: 'Prove the final layout matches the intended circuit and every foundry manufacturing rule.',
    requiredInputs: ['Final layout', 'Source netlist', 'Foundry rule decks', 'Waiver policy'],
    deliverables: ['DRC-clean report', 'LVS-clean report', 'ERC/antenna/density evidence'],
    gate: 'DRC and LVS are clean and all ERC, antenna and density exceptions are formally dispositioned.', owners: ['Physical-verification lead', 'Layout lead', 'Foundry interface owner'], route: '/drc-deck',
    tools: [{ label: 'DRC rule deck', route: '/drc-deck', purpose: 'Run manufacturing-rule checks.' }, { label: 'LVS', route: '/lvs', purpose: 'Compare layout connectivity with the source netlist.' }, { label: 'Density fill', route: '/density-fill', purpose: 'Close foundry metal-density requirements.' }, { label: 'Layout diff', route: '/layout-diff', purpose: 'Cross-check final layout revisions.' }],
  },
  {
    id: 'tapeout', order: 13, title: 'Tapeout release & accountable approvals', discipline: 'Release Governance',
    objective: 'Freeze the release candidate, reconcile evidence and obtain independent go/no-go approvals.',
    requiredInputs: ['Final GDS/OASIS and netlist', 'Closed signoff matrix', 'Known-risk and waiver register'],
    deliverables: ['Immutable tapeout package', 'Evidence manifest and checksums', 'Signed release decision'],
    gate: 'All mandatory owners approve the exact immutable release package; AI remains advisory only.', owners: ['Tapeout manager', 'Design leads', 'Quality/release authority'], route: '/governed-ai/lifecycle#phase-tapeout',
    tools: [{ label: 'Layout diff', route: '/layout-diff', purpose: 'Confirm the exact release candidate against the approved baseline.' }, { label: 'GDS hierarchy', route: '/cell-hier', purpose: 'Inspect final hierarchy before release.' }, { label: 'KLayout', route: '/klayout', purpose: 'Inspect the final physical release database.' }],
  },
  {
    id: 'silicon', order: 14, title: 'Manufacturing, package & silicon validation', discipline: 'Post-Silicon',
    objective: 'Validate package, manufacturing test, bring-up, performance, power, yield and field reliability against the product specification.',
    requiredInputs: ['Tapeout release package', 'Package/test program', 'Bring-up and characterization plan'],
    deliverables: ['First-silicon bring-up record', 'ATE/yield results', 'Characterization report', 'Production release'],
    gate: 'Silicon meets functional, PPA, reliability and yield targets with deviations fed back into the design system.', owners: ['Product engineering lead', 'Validation lead', 'Test/yield lead'], route: '/wafer',
    tools: [{ label: 'Wafer analytics', route: '/wafer', purpose: 'Analyze wafer-map and yield behavior.' }, { label: 'Reliability aging', route: '/aging', purpose: 'Model lifetime degradation and margins.' }, { label: 'FIT analysis', route: '/fit', purpose: 'Estimate reliability and failure rate.' }, { label: 'IDDQ', route: '/iddq', purpose: 'Analyze quiescent-current production screening.' }, { label: 'JTAG test', route: '/jtag', purpose: 'Validate boundary-scan and board bring-up paths.' }],
  },
];

type EvidenceCheck = { met: boolean; complete: string; missing: string };

function artifactMatches(artifacts: WorkspaceArtifact[], terms: string[]): boolean {
  return artifacts.some(artifact => {
    const value = `${artifact.kind} ${artifact.name} ${artifact.runRef}`.toLowerCase();
    return terms.some(term => value.includes(term));
  });
}

function check(met: boolean, complete: string, missing: string): EvidenceCheck {
  return { met, complete, missing };
}

function assessPhase(phase: LifecyclePhaseDefinition, workspace: WorkspaceBundle, project: WorkspaceProject): LifecyclePhaseAssessment {
  const projectId = project.id;
  const constraints = workspace.constraints.filter(item => item.projectId === projectId);
  const corners = workspace.corners.filter(item => item.projectId === projectId && item.active);
  const ppa = workspace.ppaSnapshots.filter(item => item.projectId === projectId);
  const impacts = workspace.rtlImpacts.filter(item => item.projectId === projectId);
  const artifacts = workspace.artifacts.filter(item => item.projectId === projectId);
  const approvals = workspace.approvals.filter(item => item.projectId === projectId);
  const records = workspace.featureRecords.filter(item => item.projectId === projectId);
  const reviews = workspace.aiReviews.filter(item => item.projectId === projectId);
  const latestPpa = ppa.at(0);
  const acceptedReview = reviews.some(item => item.humanStatus === 'accepted');
  const approvedRelease = approvals.some(item => item.status === 'approved');
  const hasPhaseEvidence = artifacts.some(item => item.metadata.lifecyclePhaseId === phase.id);
  const hasRecord = (...terms: string[]) => records.some(item => terms.some(term => `${item.feature} ${item.recordType} ${item.title}`.toLowerCase().includes(term)));
  const hasArtifact = (...terms: string[]) => artifactMatches(artifacts, terms);

  const phaseChecks: Record<string, EvidenceCheck[]> = {
    requirements: [
      check(Boolean(project.description?.trim()), `Project intent: ${project.description}`, 'Versioned product requirements and business intent'),
      check(hasPhaseEvidence || hasArtifact('requirement', 'spec', 'traceability'), 'Requirements/specification artifact retained', 'Requirements specification and traceability artifact'),
    ],
    architecture: [
      check(Boolean(project.topModule), `Top-level partition: ${project.topModule}`, 'Approved top-level hierarchy'),
      check(hasPhaseEvidence || hasArtifact('architecture', 'block-diagram', 'performance-model'), 'Architecture/performance evidence retained', 'Architecture, interface and performance-model artifact'),
    ],
    technology: [
      check(Boolean(project.pdkRef), `PDK reference: ${project.pdkRef}`, 'Versioned PDK reference'),
      check(corners.length >= 3, `${corners.length} active PVT/RC scenarios`, 'At least setup, hold and nominal PVT/RC scenarios'),
      check(hasPhaseEvidence || hasRecord('library', 'marketplace') || hasArtifact('liberty', 'lef', 'pdk'), 'Library/IP qualification evidence exists', 'Qualified library/IP bill of materials'),
    ],
    rtl: [
      check(Boolean(project.repositoryUrl && project.defaultBranch), `${project.repositoryUrl} · ${project.defaultBranch}`, 'Version-controlled RTL repository and branch'),
      check(hasPhaseEvidence || impacts.length > 0 || hasArtifact('rtl'), impacts.length ? `${impacts.length} RTL impact assessment(s)` : 'RTL artifact retained', 'RTL build or change-impact evidence'),
    ],
    verification: [
      check(hasPhaseEvidence || hasArtifact('verification', 'coverage', 'regression', 'formal'), 'Functional verification evidence retained', 'Simulation/formal regression and coverage report'),
      check(hasArtifact('cdc', 'rdc'), 'CDC/RDC evidence retained', 'CDC and RDC closure report'),
    ],
    'synthesis-dft': [
      check(ppa.length > 0 || hasArtifact('synthesis', 'netlist'), `${ppa.length} synthesis/PPA snapshot(s)`, 'Synthesized netlist and QoR report'),
      check(hasPhaseEvidence || hasArtifact('lec', 'equivalence'), 'Equivalence evidence retained', 'RTL-to-netlist equivalence report'),
      check(hasArtifact('dft', 'scan', 'atpg', 'mbist'), 'DFT evidence retained', 'Scan, ATPG and memory-test evidence'),
    ],
    'floorplan-pdn': [
      check(hasPhaseEvidence || hasArtifact('floorplan', 'upf', 'pdn') || hasRecord('co-design'), 'Floorplan/power-planning evidence exists', 'Approved floorplan, UPF and PDN artifacts'),
      check(Boolean(latestPpa && latestPpa.congestionPct < 75), latestPpa ? `Early congestion: ${latestPpa.congestionPct}%` : 'Congestion evidence exists', 'Early routability and congestion assessment'),
    ],
    placement: [
      check(ppa.length > 0, `${ppa.length} placement/PPA snapshot(s)`, 'Legal placement and pre-CTS QoR snapshot'),
      check(Boolean(latestPpa && latestPpa.congestionPct <= 65), latestPpa ? `Congestion ${latestPpa.congestionPct}% meets 65% target` : 'Congestion meets threshold', 'Placement congestion at or below 65%'),
    ],
    cts: [
      check(constraints.some(item => /create_clock/i.test(item.sdc)), 'Active SDC defines clocks', 'Versioned clock definitions and exceptions'),
      check(hasPhaseEvidence || hasArtifact('cts', 'clock', 'skew', 'pulse'), 'CTS evidence retained', 'Clock skew, latency, gating and pulse-width reports'),
    ],
    'route-extraction': [
      check(hasPhaseEvidence || hasArtifact('route', 'routed', 'def', 'gds'), 'Routed-design evidence retained', 'Routed database/DEF'),
      check(hasArtifact('spef', 'parasitic', 'extraction'), 'Parasitic evidence retained', 'Signoff parasitic extraction/SPEF'),
    ],
    signoff: [
      check(constraints.some(item => item.active), 'Active versioned constraint set', 'Active signoff constraint set'),
      check(corners.length >= 3, `${corners.length} active MCMM scenarios`, 'Complete setup/hold/power corner matrix'),
      check(Boolean(latestPpa && latestPpa.wnsNs >= 0 && latestPpa.tnsNs >= 0), latestPpa ? `Timing: WNS ${latestPpa.wnsNs} ns / TNS ${latestPpa.tnsNs} ns` : 'Timing closes', 'Non-negative setup/hold timing across all required scenarios'),
      check(hasPhaseEvidence || hasArtifact('ir', 'em', 'signal-integrity', 'noise', 'power'), 'Power/SI/IR/EM evidence retained', 'Vector power, SI, IR-drop and EM reports'),
    ],
    'physical-verification': [
      check(Boolean(latestPpa && latestPpa.drcCount === 0), latestPpa ? 'PPA snapshot reports DRC = 0' : 'DRC is clean', 'DRC-clean signoff evidence'),
      check(hasPhaseEvidence || hasArtifact('lvs'), 'LVS evidence retained', 'LVS-clean report'),
      check(hasArtifact('antenna', 'erc', 'density'), 'Antenna/ERC/density evidence retained', 'Antenna, ERC and density closure evidence'),
    ],
    tapeout: [
      check(approvedRelease, 'Approved accountable engineering decision exists', 'Independent release approval'),
      check(acceptedReview, 'A governed AI review was accepted by a human', 'Human disposition of a governed AI review'),
      check(hasPhaseEvidence || hasArtifact('gds', 'oasis', 'release', 'tapeout'), 'Immutable release artifact retained', 'Checksummed GDS/OASIS tapeout package and evidence manifest'),
    ],
    silicon: [
      check(hasRecord('spice') || hasArtifact('spice'), 'Circuit-regression evidence exists', 'Pre-silicon circuit characterization evidence'),
      check(hasPhaseEvidence || hasArtifact('silicon', 'bringup', 'ate', 'yield', 'package', 'characterization'), 'Post-silicon evidence retained', 'Bring-up, ATE, yield, package and characterization evidence'),
    ],
  };

  const checks = phaseChecks[phase.id] ?? [];
  const met = checks.filter(item => item.met);
  const progress = checks.length ? Math.round((met.length / checks.length) * 100) : 0;
  return {
    ...phase,
    status: progress === 100 ? 'complete' : progress > 0 ? 'in-progress' : 'not-started',
    progress,
    completedEvidence: met.map(item => item.complete),
    missingEvidence: checks.filter(item => !item.met).map(item => item.missing),
  };
}

export function buildLifecycleProfile(workspace: WorkspaceBundle, projectId?: string): LifecycleProfile | null {
  const project = workspace.projects.find(item => item.id === projectId) ?? workspace.projects[0];
  if (!project) return null;
  const phases = CHIP_DESIGN_LIFECYCLE.map(phase => assessPhase(phase, workspace, project));
  const completeCount = phases.filter(item => item.status === 'complete').length;
  const inProgressCount = phases.filter(item => item.status === 'in-progress').length;
  const notStartedCount = phases.filter(item => item.status === 'not-started').length;
  return {
    project,
    phases,
    overallProgress: Math.round(phases.reduce((sum, item) => sum + item.progress, 0) / phases.length),
    completeCount,
    inProgressCount,
    notStartedCount,
  };
}

export function buildLifecycleChatPrompt(profile: LifecycleProfile, phaseId: string): string {
  const phase = profile.phases.find(item => item.id === phaseId) ?? profile.phases[0];
  return `Act as the accountable ${phase.discipline} specialist for chip project "${profile.project.name}".

Lifecycle phase ${phase.order} of ${profile.phases.length}: ${phase.title}
Objective: ${phase.objective}
Current status: ${phase.status}; evidence completion: ${phase.progress}%
Project context: top module ${profile.project.topModule || 'not defined'}, PDK ${profile.project.pdkRef || 'not defined'}, repository ${profile.project.repositoryUrl || 'not defined'} on ${profile.project.defaultBranch || 'not defined'}.

Evidence already retained:
${phase.completedEvidence.length ? phase.completedEvidence.map(item => `- ${item}`).join('\n') : '- None retained yet'}

Missing or unproven evidence:
${phase.missingEvidence.length ? phase.missingEvidence.map(item => `- ${item}`).join('\n') : '- None identified'}

Required deliverables:
${phase.deliverables.map(item => `- ${item}`).join('\n')}

Gate: ${phase.gate}
Accountable owners: ${phase.owners.join(', ')}

Review this phase professionally. Separate retained facts from assumptions, identify the most important technical risks, prescribe concrete next experiments and evidence artifacts, give measurable pass/fail criteria and stop conditions, and state what must be approved by a human before the project advances. Do not claim that missing evidence has been produced.`;
}

export function lifecyclePhaseForFeature(feature: string): string {
  const mapping: Record<string, string> = {
    ppa: 'signoff',
    'rtl-impact': 'rtl',
    'spice-regression': 'signoff',
    'library-marketplace': 'technology',
    'co-design': 'tapeout',
  };
  return mapping[feature] ?? 'requirements';
}

export function inferLifecyclePhaseId(input: string, fallback = 'requirements'): string {
  const value = input.toLowerCase();
  const rules: Array<[string, RegExp]> = [
    ['silicon', /\b(silicon|bring[- ]?up|wafer|yield|ate|package|iddq|characterization|production test)\b/],
    ['tapeout', /\b(tapeout|release candidate|release gate|gdsii|oasis|final approval|signoff manifest)\b/],
    ['physical-verification', /\b(drc|lvs|erc|antenna|density|physical verification)\b/],
    ['signoff', /\b(ppa|mcmm|sta|setup|hold|timing|power|ir drop|electromigration|\bem\b|signal integrity|ocv|aocv|pocv)\b/],
    ['route-extraction', /\b(route|routing|parasitic|spef|extraction|wirelength|wire length)\b/],
    ['cts', /\b(cts|clock tree|clock skew|clock latency|pulse width|clock gating)\b/],
    ['placement', /\b(placement|legalization|congestion|cell overlap|cell density)\b/],
    ['floorplan-pdn', /\b(floorplan|floorplanning|pdn|power grid|macro placement|pin assignment|upf|voltage area)\b/],
    ['synthesis-dft', /\b(synthesis|netlist|equivalence|lec|dft|scan|atpg|mbist|lbist)\b/],
    ['verification', /\b(verification|simulation|formal|coverage|cdc|rdc|assertion|testbench|uvm)\b/],
    ['rtl', /\b(rtl|verilog|systemverilog|vhdl|lint|module|register transfer)\b/],
    ['technology', /\b(pdk|liberty|lef|standard cell|ip library|process node|pvt|rc corner)\b/],
    ['architecture', /\b(architecture|microarchitecture|partition|bandwidth|memory map|noc|interconnect|pipeline)\b/],
    ['requirements', /\b(requirement|specification|use case|acceptance criteria|product target|complete chip|design a complete)\b/],
  ];
  return rules.find(([, pattern]) => pattern.test(value))?.[0] ?? fallback;
}
