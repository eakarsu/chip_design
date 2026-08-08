'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Alert, Box, Button, Card, CardContent, CircularProgress, Container, FormControl, InputLabel, MenuItem, Select, Stack, TextField, Typography } from '@mui/material';
import Grid from '@mui/material/Grid2';
import { AutoAwesome, DeleteSweep, Science, Save } from '@mui/icons-material';
import DecisionBriefView from './DecisionBriefView';
import type { DecisionBrief, WorkspaceBundle } from '@/lib/commercial/types';
import { useAuth } from '@/lib/auth/context';

export type CommercialFeature = 'ppa' | 'rtl-impact' | 'spice-regression' | 'co-design' | 'library-marketplace';
type Values = Record<string, string>;
type ScenarioKey = 'nominal' | 'optimization' | 'signoff' | 'highRisk';

type Field = { key: string; label: string; type?: 'number' | 'multiline'; helper?: string };
type Config = {
  title: string;
  subtitle: string;
  endpoint: string;
  action: string;
  fields: Field[];
  nominal: Values;
  optimization: Values;
  signoff: Values;
  highRisk: Values;
};

const AI_CONTEXT_FIELDS: Field[] = [
  { key: 'reviewObjective', label: 'AI review objective (optional)', helper: 'The decision or engineering outcome the AI should support.' },
  { key: 'decisionQuestion', label: 'Decision question (optional)', helper: 'Ask one precise question that the decision brief must answer.' },
  { key: 'assumptions', label: 'Assumptions to challenge (optional)', type: 'multiline', helper: 'One assumption per line. The challenger pass will test each one.' },
  { key: 'acceptanceCriteria', label: 'Acceptance criteria and stop conditions (optional)', type: 'multiline', helper: 'One measurable gate per line.' },
  { key: 'reviewerContext', label: 'Additional reviewer context (optional)', type: 'multiline', helper: 'Operating modes, schedule constraints, known limitations, or required comparisons.' },
];

const AI_CONTEXT_KEYS = new Set(AI_CONTEXT_FIELDS.map(field => field.key));

const configurations: Record<CommercialFeature, Config> = {
  ppa: {
    title: 'Continuous PPA Tracking', subtitle: 'Compare every commit against the latest measured baseline and enforce area, power, performance, DRC and congestion guardrails.', endpoint: '/api/workspace/ppa', action: 'Score & save commit',
    fields: [
      { key: 'commitSha', label: 'Commit SHA' }, { key: 'branch', label: 'Branch' }, { key: 'message', label: 'Commit message' }, { key: 'author', label: 'Author' },
      { key: 'areaUm2', label: 'Area (µm²)', type: 'number' }, { key: 'powerMw', label: 'Power (mW)', type: 'number' }, { key: 'wnsNs', label: 'WNS (ns)', type: 'number' }, { key: 'tnsNs', label: 'TNS (ns)', type: 'number' },
      { key: 'drcCount', label: 'DRC violations', type: 'number' }, { key: 'congestionPct', label: 'Peak congestion (%)', type: 'number' }, { key: 'evidence', label: 'Evidence paths (one per line)', type: 'multiline' },
    ],
    nominal: { commitSha: '9b12e4f', branch: 'main', message: 'Balance accumulator pipeline', author: 'Maya Chen', areaUm2: '853400', powerMw: '189.1', wnsNs: '0.018', tnsNs: '0', drcCount: '1', congestionPct: '62.8', evidence: 'runs/9b12e4f/metrics.json\nruns/9b12e4f/signoff/summary.rpt' },
    optimization: { commitSha: 'b47ea81', branch: 'feature/power-recovery', message: 'Gate idle MAC lanes and resize non-critical buffers', author: 'Priya Natarajan', areaUm2: '842900', powerMw: '173.6', wnsNs: '0.011', tnsNs: '0', drcCount: '0', congestionPct: '59.4', evidence: 'runs/b47ea81/metrics.json\nruns/b47ea81/power/activity-assumptions.json\nruns/b47ea81/timing/max.rpt\nruns/b47ea81/drc.rpt' },
    signoff: { commitSha: 'c29f513', branch: 'release/tapeout-candidate', message: 'Freeze release candidate after MMMC closure sweep', author: 'Elena Park', areaUm2: '856120', powerMw: '187.4', wnsNs: '0.006', tnsNs: '0', drcCount: '0', congestionPct: '64.1', evidence: 'runs/c29f513/run-manifest.json\nruns/c29f513/timing/mmmc-summary.rpt\nruns/c29f513/power/signoff.rpt\nruns/c29f513/physical/drc-summary.rpt' },
    highRisk: { commitSha: 'd781c2a', branch: 'feature/wide-mac', message: 'Expand multiplier width', author: 'Jon Bell', areaUm2: '902800', powerMw: '211.5', wnsNs: '-0.124', tnsNs: '-18.3', drcCount: '14', congestionPct: '78.2', evidence: 'runs/d781c2a/metrics.json\nruns/d781c2a/timing/max.rpt\nruns/d781c2a/drc.rpt' },
  },
  'rtl-impact': {
    title: 'RTL-to-PnR Impact Analysis', subtitle: 'Tie a specific RTL change to measured downstream timing, power, congestion and physical-verification effects.', endpoint: '/api/workspace/impact', action: 'Analyze & save impact',
    fields: [
      { key: 'baseSha', label: 'Base SHA' }, { key: 'targetSha', label: 'Target SHA' }, { key: 'changedModules', label: 'Changed modules (one per line)', type: 'multiline' },
      { key: 'timingDeltaNs', label: 'WNS delta (ns)', type: 'number' }, { key: 'powerDeltaPct', label: 'Power delta (%)', type: 'number' }, { key: 'congestionDeltaPct', label: 'Congestion delta (%)', type: 'number' }, { key: 'drcDelta', label: 'DRC delta', type: 'number' },
      { key: 'affectedPaths', label: 'Affected timing paths (one per line)', type: 'multiline' }, { key: 'evidence', label: 'Evidence paths (one per line)', type: 'multiline' },
    ],
    nominal: { baseSha: 'f40ab91', targetSha: '9b12e4f', changedModules: 'accumulator\nwriteback_ctrl', timingDeltaNs: '0.005', powerDeltaPct: '0.21', congestionDeltaPct: '-0.6', drcDelta: '-1', affectedPaths: 'core_clk/accumulator/U4/Q → writeback/U2/D', evidence: 'git/diff/f40ab91..9b12e4f\nruns/9b12e4f/timing/max.rpt' },
    optimization: { baseSha: '9b12e4f', targetSha: 'b47ea81', changedModules: 'mac_lane_clock_gate\npower_ctrl\noperand_isolation', timingDeltaNs: '-0.007', powerDeltaPct: '-8.2', congestionDeltaPct: '-2.1', drcDelta: '-1', affectedPaths: 'core_clk/power_ctrl/U7/Q → mac_lane_clock_gate/U2/EN\ncore_clk/operand_isolation/U4/Q → mac_array/U12/A', evidence: 'git/diff/9b12e4f..b47ea81\nruns/b47ea81/synthesis/hierarchy-delta.json\nruns/b47ea81/timing/path-diff.rpt\nruns/b47ea81/power/delta.rpt' },
    signoff: { baseSha: 'b47ea81', targetSha: 'c29f513', changedModules: 'clock_constraints\nreset_synchronizer\nscan_wrapper', timingDeltaNs: '-0.005', powerDeltaPct: '0.8', congestionDeltaPct: '1.2', drcDelta: '0', affectedPaths: 'scan_clk/scan_wrapper/U18/Q → reset_synchronizer/U3/D\ncore_clk/reset_synchronizer/U2/Q → power_ctrl/U5/RN', evidence: 'git/diff/b47ea81..c29f513\nruns/c29f513/cdc/summary.rpt\nruns/c29f513/timing/mmmc-path-diff.rpt\nruns/c29f513/physical/drc-summary.rpt' },
    highRisk: { baseSha: '9b12e4f', targetSha: 'd781c2a', changedModules: 'mac_array\nmultiplier_tree\noperand_router', timingDeltaNs: '-0.142', powerDeltaPct: '11.8', congestionDeltaPct: '15.4', drcDelta: '13', affectedPaths: 'core_clk/mac_array/U82/Q → accumulator/U18/D\ncore_clk/operand_router/U9/Q → multiplier/U7/D', evidence: 'git/diff/9b12e4f..d781c2a\nruns/d781c2a/timing/max.rpt\nruns/d781c2a/congestion.rpt' },
  },
  'spice-regression': {
    title: 'Accelerated SPICE Regression', subtitle: 'Register simulator suites, PVT coverage, accelerator capacity, failures and numerical deltas as reviewable evidence.', endpoint: '/api/workspace/features/spice-regression', action: 'Save regression result',
    fields: [{ key: 'title', label: 'Regression suite' }, { key: 'simulator', label: 'Simulator' }, { key: 'accelerator', label: 'Compute accelerator' }, { key: 'corners', label: 'PVT corners', type: 'number' }, { key: 'passed', label: 'Passed tests', type: 'number' }, { key: 'failed', label: 'Failed tests', type: 'number' }, { key: 'worstDeltaPct', label: 'Worst golden delta (%)', type: 'number' }, { key: 'evidence', label: 'Evidence paths (one per line)', type: 'multiline' }],
    nominal: { title: 'PLL lock acquisition regression', simulator: 'ngspice', accelerator: 'GPU-8', corners: '18', passed: '214', failed: '0', worstDeltaPct: '1.4', evidence: 'spice/pll/run-318/report.json\nspice/pll/run-318/waveform-index.json' },
    optimization: { title: 'LDO load-transient tolerance sweep', simulator: 'xyce', accelerator: 'GPU-8', corners: '32', passed: '508', failed: '2', worstDeltaPct: '3.1', evidence: 'spice/ldo/run-402/run-manifest.json\nspice/ldo/run-402/measurements.csv\nspice/ldo/run-402/golden-comparison.json\nspice/ldo/run-402/failures.csv' },
    signoff: { title: 'Bandgap pre-release full-corner regression', simulator: 'spectre-compatible', accelerator: 'CPU-64', corners: '48', passed: '1152', failed: '0', worstDeltaPct: '0.9', evidence: 'spice/bandgap/run-517/run-manifest.json\nspice/bandgap/run-517/pvt-coverage.json\nspice/bandgap/run-517/monte-carlo-summary.rpt\nspice/bandgap/run-517/golden-provenance.json' },
    highRisk: { title: 'SRAM read-margin regression', simulator: 'xyce', accelerator: 'GPU-16', corners: '24', passed: '331', failed: '17', worstDeltaPct: '12.6', evidence: 'spice/sram/run-411/report.json\nspice/sram/run-411/failures.csv' },
  },
  'co-design': {
    title: 'Live Co-design Review', subtitle: 'Capture a design review session, active artifact, participants, unresolved comments and immutable session evidence.', endpoint: '/api/workspace/features/co-design', action: 'Create review session',
    fields: [{ key: 'title', label: 'Session title' }, { key: 'focus', label: 'Design focus' }, { key: 'artifact', label: 'Active artifact' }, { key: 'participants', label: 'Participants', type: 'number' }, { key: 'unresolvedComments', label: 'Unresolved comments', type: 'number' }, { key: 'notes', label: 'Review agenda and notes', type: 'multiline' }, { key: 'evidence', label: 'Evidence paths (one per line)', type: 'multiline' }],
    nominal: { title: 'Clock-tree review', focus: 'Skew and useful-skew exceptions', artifact: 'runs/9b12e4f/cts.def', participants: '4', unresolvedComments: '1', notes: 'Review trunk topology, macro obstructions and the two remaining exception paths.', evidence: 'sessions/cts-review-22/transcript.json\nruns/9b12e4f/cts.rpt' },
    optimization: { title: 'Power-performance tradeoff review', focus: 'Clock gating, operand isolation and residual timing margin', artifact: 'runs/b47ea81/final.def', participants: '6', unresolvedComments: '3', notes: 'Compare the power recovery against wake-up latency, enable-path timing, verification coverage and CTS impact. Assign an owner to every unresolved assumption.', evidence: 'sessions/power-review-31/transcript.json\nruns/b47ea81/power/delta.rpt\nruns/b47ea81/timing/path-diff.rpt\nsessions/power-review-31/decision-log.json' },
    signoff: { title: 'Tapeout candidate evidence review', focus: 'MMMC closure, physical verification, artifact provenance and release gates', artifact: 'runs/c29f513/signoff/manifest.json', participants: '9', unresolvedComments: '2', notes: 'Reconcile the release manifest to the reviewed RTL SHA, SDC version, PDK, libraries, extraction corner set, DRC/LVS summaries and waiver owners before recommending advancement.', evidence: 'sessions/tapeout-gate-07/transcript.json\nruns/c29f513/signoff/manifest.json\nruns/c29f513/timing/mmmc-summary.rpt\nsessions/tapeout-gate-07/action-register.csv' },
    highRisk: { title: 'Signoff escalation', focus: 'Setup regression and DRC cluster', artifact: 'runs/d781c2a/final.def', participants: '7', unresolvedComments: '8', notes: 'Block release until timing ownership, routing congestion and DRC evidence have accountable owners.', evidence: 'sessions/signoff-escalation-04/transcript.json\nruns/d781c2a/signoff/summary.rpt' },
  },
  'library-marketplace': {
    title: 'Design Library Registry', subtitle: 'Publish versioned, license-aware design libraries with PDK compatibility, checksums, qualification evidence and review status.', endpoint: '/api/workspace/features/library-marketplace', action: 'Register library release',
    fields: [{ key: 'title', label: 'Library name and version' }, { key: 'pdk', label: 'Compatible PDK' }, { key: 'license', label: 'License' }, { key: 'cells', label: 'Cell count', type: 'number' }, { key: 'checksum', label: 'Manifest SHA-256' }, { key: 'qualification', label: 'Qualification level' }, { key: 'evidence', label: 'Evidence paths (one per line)', type: 'multiline' }],
    nominal: { title: 'Atlas IO Cells 1.4.0', pdk: 'sky130A@1.0.0', license: 'Apache-2.0', cells: '36', checksum: 'b8f2d4a932cc0d76d19e791ea47cf8d18af89d1df756be358abc7215cd286130', qualification: 'Open-flow regression verified', evidence: 'libraries/atlas-io/1.4.0/manifest.json\nlibraries/atlas-io/1.4.0/qualification.rpt' },
    optimization: { title: 'Nova Low-Power Cells 2.1.0', pdk: 'sky130A@1.0.0', license: 'Apache-2.0 with NOTICE', cells: '84', checksum: 'd912a6c3f96e374a0bc7559135590e6c24649578c44c53733bc5ea08ae84c921', qualification: 'PPA characterized and open-flow regression verified', evidence: 'libraries/nova-lp/2.1.0/manifest.json\nlibraries/nova-lp/2.1.0/liberty-corner-matrix.json\nlibraries/nova-lp/2.1.0/drc-lvs-summary.rpt\nlibraries/nova-lp/2.1.0/license/NOTICE' },
    signoff: { title: 'Atlas SRAM Compilers 3.0.2', pdk: 'sky130A@1.0.0', license: 'Commercial evaluation license', cells: '128', checksum: '34cb3fdf84e2f51252ef33197c136c24e818f62399a50da621eec9aaacccf774', qualification: 'Release-candidate qualification pending independent checksum and corner audit', evidence: 'libraries/atlas-sram/3.0.2/manifest.json\nlibraries/atlas-sram/3.0.2/views-consistency.rpt\nlibraries/atlas-sram/3.0.2/characterization-matrix.json\nlibraries/atlas-sram/3.0.2/license/entitlement.pdf' },
    highRisk: { title: 'Legacy RF Macros 0.8.2', pdk: 'unknown-180nm', license: 'Unverified proprietary', cells: '12', checksum: 'a7f2d4a932cc0d76d19e791ea47cf8d18af89d1df756be358abc7215cd286139', qualification: 'Unverified', evidence: 'libraries/legacy-rf/0.8.2/manifest.json' },
  },
};

const AI_CONTEXT_BY_FEATURE: Record<CommercialFeature, Record<ScenarioKey, Values>> = {
  ppa: {
    nominal: {
      reviewObjective: 'Confirm that this commit improves implementation quality without crossing governed PPA or physical-verification thresholds.',
      decisionQuestion: 'Is the commit comparable to the active baseline and safe to retain for the next implementation stage?',
      assumptions: 'The baseline and candidate use the same RTL scope, PDK, libraries, SDC and MMMC corner set.\nPower uses the same activity source and voltage assumptions.\nReported DRC counts exclude only approved, traceable waivers.',
      acceptanceCriteria: 'WNS and TNS remain non-negative in every required setup scenario.\nPower and area deltas remain inside the configured guardrails.\nNo new unwaived DRC or congestion hotspot is introduced.\nEvery metric links to a reproducible run manifest and primary report.',
      reviewerContext: 'Treat small positive slack as fragile until OCV, extraction and path-group coverage are verified. Separate measured improvements from causal claims about the RTL change.',
    },
    optimization: {
      reviewObjective: 'Evaluate whether the proposed low-power optimization delivers credible energy reduction without hidden timing, wake-up, test or physical-design regressions.',
      decisionQuestion: 'Should the power-recovery commit advance as the new PPA baseline, and what controlled experiments remain mandatory?',
      assumptions: 'Clock-gating enables are functionally verified and glitch-safe.\nActivity factors represent the intended workloads and idle residency.\nBuffer resizing did not alter hold closure, scan behavior or voltage-domain crossings.',
      acceptanceCriteria: 'Dynamic and leakage power improvements reproduce across required workloads and corners.\nSetup and hold margins remain above project guardbands.\nClock-gating checks, DFT coverage and power-aware simulation pass.\nArea, congestion and DRC do not regress beyond approved limits.',
      reviewerContext: 'Prioritize activity provenance, gating enable timing, minimum pulse width, isolation sequencing and any paths newly exposed by cell resizing.',
    },
    signoff: {
      reviewObjective: 'Challenge the tapeout-candidate PPA evidence for run equivalence, full scenario coverage and release-gate completeness.',
      decisionQuestion: 'Does the evidence support freezing this commit as a release candidate, or must advancement remain on hold?',
      assumptions: 'The reviewed commit exactly matches the implementation and signoff artifacts.\nAll required functional, test and low-power modes are included.\nThe zero DRC count excludes no undocumented waiver or stale result.',
      acceptanceCriteria: 'All required setup, hold, recovery and removal scenarios satisfy project guardbands.\nPower is reviewed against package and thermal budgets with traceable activity.\nDRC, LVS, antenna, density and reliability summaries match the release manifest.\nAn accountable signoff owner approves each evidence domain.',
      reviewerContext: 'This is a pre-release evidence challenge, not permission to claim foundry signoff. Identify stale, mismatched or missing artifacts explicitly.',
    },
    highRisk: {
      reviewObjective: 'Diagnose the severe PPA regression, distinguish likely causes from measurements and define a bounded recovery plan.',
      decisionQuestion: 'Which regressions are release blockers, what is the most likely failure mechanism, and what must be tested before another run?',
      assumptions: 'The large timing, power and congestion deltas are not caused by tool-version or constraint drift.\nThe wide-MAC change is the only material RTL difference.\nThe DRC cluster is spatially correlated with the expanded datapath.',
      acceptanceCriteria: 'Do not advance while WNS or TNS violates the active guardband.\nRestore power and congestion within governed limits or approve a documented budget change.\nResolve every new DRC or prove an approved waiver with ownership.\nReproduce the regression with an identical-control baseline run.',
      reviewerContext: 'Demand controlled synthesis and PnR comparisons before attributing causality. Recommend the smallest experiments that isolate width, mapping, placement density and routing pressure.',
    },
  },
  'rtl-impact': {
    nominal: {
      reviewObjective: 'Validate the claimed downstream impact of a focused RTL change across synthesis, timing, power, congestion and physical verification.',
      decisionQuestion: 'Is the observed implementation delta consistent, bounded and sufficiently evidenced to merge the RTL change?',
      assumptions: 'Only the named modules changed between SHAs.\nBoth implementation runs use identical tool, seed, constraint, PDK and library inputs.\nThe affected-path list was generated from full path-group comparison.',
      acceptanceCriteria: 'Changed hierarchy and mapped-cell deltas are explained.\nNo new CDC, reset, test or low-power structural issue is introduced.\nTiming, power, congestion and DRC remain within project guardrails.\nThe comparison is reproducible from named manifests and reports.',
      reviewerContext: 'Do not treat correlation as causation. Trace the changed logic through fanout, path groups and placement neighborhoods before concluding the RTL caused the physical effect.',
    },
    optimization: {
      reviewObjective: 'Assess power-control RTL changes for actual power benefit and downstream clock, timing, CDC, DFT and physical-design risk.',
      decisionQuestion: 'Does the low-power RTL change earn its measured benefit without creating unsafe control or closure risk?',
      assumptions: 'Clock-gating and isolation controls are synchronized to the correct domains.\nPower intent and RTL behavior agree.\nPower measurements use comparable vectors and operating conditions.',
      acceptanceCriteria: 'Power-aware simulation and structural checks cover all new controls.\nEnable, isolation and reset paths meet timing in required scenarios.\nMeasured power benefit survives identical-control reruns.\nNo material congestion, DRC, test-coverage or wake-up regression remains.',
      reviewerContext: 'Challenge enable-path latency, glitch safety, X propagation, retention assumptions and the effect of new high-fanout control nets.',
    },
    signoff: {
      reviewObjective: 'Review late RTL and constraint changes against the frozen signoff baseline and identify every invalidated downstream artifact.',
      decisionQuestion: 'Can this release-candidate delta be accepted without rerunning any omitted signoff domain?',
      assumptions: 'The base SHA is the approved release baseline.\nConstraint and scan changes are intentional and independently reviewed.\nArtifact timestamps and manifests accurately identify which runs include the target SHA.',
      acceptanceCriteria: 'CDC/RDC, equivalence, DFT, MMMC timing and physical verification are rerun where invalidated.\nAll affected paths and modes have accountable owners.\nNo artifact from the base SHA is represented as target-SHA evidence.\nRelease approval remains human-controlled.',
      reviewerContext: 'Produce an invalidation matrix: RTL/SDC change → affected analyses → required reruns → evidence owner → exit criterion.',
    },
    highRisk: {
      reviewObjective: 'Investigate a wide-datapath RTL change associated with timing collapse, power growth, congestion and new DRC violations.',
      decisionQuestion: 'What evidence is sufficient to isolate root cause and determine whether to revert, partition or redesign the change?',
      assumptions: 'Tool and run configuration are comparable.\nThe critical paths traverse the changed multiplier hierarchy.\nCongestion and DRC deltas are not unrelated baseline noise.',
      acceptanceCriteria: 'Hold merge while timing and physical guardrails fail.\nRun controlled mapping, pipeline and floorplan experiments.\nVerify path, cell and spatial correlation for every causal claim.\nSelect a recovery option only after comparing PPA and verification consequences.',
      reviewerContext: 'Consider pipeline depth, operator inference, fanout, macro/channel pressure and operand-routing topology. Do not recommend an ECO that masks an architectural problem.',
    },
  },
  'spice-regression': {
    nominal: {
      reviewObjective: 'Confirm numerical equivalence, PVT coverage and reproducibility for the passing PLL regression suite.',
      decisionQuestion: 'Is the regression evidence strong enough to accept the model and testbench changes for continued qualification?',
      assumptions: 'Golden waveforms and measurement definitions are versioned and approved.\nSimulator tolerances and initial conditions are controlled.\nThe accelerator changes throughput only, not numerical behavior.',
      acceptanceCriteria: 'All required PVT/RC corners are represented.\nMeasured deltas remain inside circuit-specific tolerances.\nNo convergence retry silently changes the analysis method.\nWaveforms, measurements, logs and manifests are retained.',
      reviewerContext: 'Review lock time, steady-state error, phase margin proxies and outlier handling. Passing test count alone is not qualification evidence.',
    },
    optimization: {
      reviewObjective: 'Triage the two load-transient failures and determine whether they reflect tolerance noise, a real stability margin issue or a golden-model mismatch.',
      decisionQuestion: 'Can the optimization continue conditionally, and which simulations or measurements must resolve the remaining failures?',
      assumptions: 'The two failures are reproducible.\nLoad steps, parasitics and regulator initial conditions match the golden suite.\nThe worst delta is measured with the same window and normalization.',
      acceptanceCriteria: 'Reproduce both failures on an independent compute path.\nVerify loop-stability, overshoot, undershoot and settling limits at implicated corners.\nDocument any tolerance change with engineering justification.\nDo not waive a failure solely because aggregate pass rate is high.',
      reviewerContext: 'Separate numerical convergence behavior from circuit response. Compare raw waveforms and measurement scripts before changing limits.',
    },
    signoff: {
      reviewObjective: 'Challenge full-corner bandgap regression evidence for model provenance, mismatch coverage and pre-release completeness.',
      decisionQuestion: 'Which evidence gaps, if any, prevent the bandgap model and testbench set from entering the release manifest?',
      assumptions: 'The 48-corner matrix covers the required process, voltage, temperature and RC combinations.\nMonte Carlo seeds and mismatch models are traceable.\nThe golden reference matches the intended model release.',
      acceptanceCriteria: 'PVT, startup, line/load regulation, temperature coefficient and mismatch requirements are covered.\nGolden provenance and measurement scripts are immutable.\nIndependent reruns reproduce bounded numerical deltas.\nAn analog verification owner approves the release evidence.',
      reviewerContext: 'Check missing cold-start, low-supply, slow-ramp and Monte Carlo tail behavior even when all deterministic cases pass.',
    },
    highRisk: {
      reviewObjective: 'Diagnose widespread SRAM read-margin failures and determine whether advancement must stop pending model, circuit or methodology correction.',
      decisionQuestion: 'What failure clusters and controlled experiments best distinguish real margin loss from simulator or testbench artifacts?',
      assumptions: 'Failures are concentrated in identifiable PVT or mismatch conditions.\nGolden thresholds are valid for this SRAM revision.\nSimulator acceleration has not altered numerical precision.',
      acceptanceCriteria: 'Hold qualification while unexplained read-margin failures remain.\nCluster failures by corner, instance, seed and measurement.\nReproduce representative failures with conservative solver settings.\nVerify extracted parasitics, bitcell models and sense-amplifier timing.',
      reviewerContext: 'Prioritize raw waveform evidence, failing-seed replay and cross-simulator comparison. Do not average away tail-risk failures.',
    },
  },
  'co-design': {
    nominal: {
      reviewObjective: 'Convert the clock-tree review into accountable decisions, evidence requests and measurable exit gates.',
      decisionQuestion: 'Can the CTS artifact advance, and who owns the remaining exception-path decision?',
      assumptions: 'Every participant reviewed the same DEF, SDC and timing-report versions.\nUseful-skew exceptions are intentional and documented.\nMacro obstructions match the active floorplan.',
      acceptanceCriteria: 'Resolve or assign every comment with a due date.\nLink skew, latency and exception decisions to primary reports.\nCapture rejected alternatives and tradeoffs.\nRequire independent timing-owner approval before closure.',
      reviewerContext: 'Distinguish discussion from evidence. A meeting consensus cannot replace reproducible timing and physical-design reports.',
    },
    optimization: {
      reviewObjective: 'Structure a cross-functional decision on a power optimization that affects RTL, timing, verification and physical implementation.',
      decisionQuestion: 'Which tradeoff decision is supported now, and which unresolved assumptions block adoption of the low-power change?',
      assumptions: 'Power savings reproduce on representative workloads.\nVerification covers gating and isolation sequences.\nImplementation reports use the reviewed RTL and constraint versions.',
      acceptanceCriteria: 'Assign owners for the three unresolved comments.\nRecord power benefit, timing cost and verification scope in one decision log.\nDefine rollback and stop conditions.\nRequire RTL, verification and physical-design concurrence.',
      reviewerContext: 'Expose discipline-specific conflicts rather than smoothing them into consensus. Every accepted risk needs an owner and verification plan.',
    },
    signoff: {
      reviewObjective: 'Run an evidence-centered tapeout gate review with artifact-version reconciliation and independent approval boundaries.',
      decisionQuestion: 'What exactly remains incomplete before the release candidate can be recommended to the accountable signoff authority?',
      assumptions: 'The manifest identifies the exact RTL, netlist, SDC, libraries, PDK and extracted views.\nAll presented summaries are generated from that manifest.\nWaiver owners are available and authorized.',
      acceptanceCriteria: 'Resolve every manifest mismatch and unowned waiver.\nLink all signoff claims to primary evidence.\nClose action items or record explicit hold decisions.\nPrevent the AI or meeting facilitator from granting release approval.',
      reviewerContext: 'Produce a concise release-readiness ledger organized by evidence domain, owner, status, blocker and required approval.',
    },
    highRisk: {
      reviewObjective: 'Stabilize a signoff escalation by separating verified blockers, hypotheses, owners and immediate containment actions.',
      decisionQuestion: 'What must stop now, what can be investigated in parallel, and which evidence closes each blocker?',
      assumptions: 'The timing regression and DRC cluster belong to the same target build.\nAll eight unresolved comments are still active.\nNo release exception has been approved.',
      acceptanceCriteria: 'Keep release on hold.\nAssign one accountable owner and deadline to every blocker.\nReproduce timing and DRC findings from immutable artifacts.\nRequire independent closure evidence for every resolved item.',
      reviewerContext: 'Avoid vague action items such as “investigate.” Specify the report, experiment, expected result, owner and decision enabled by each action.',
    },
  },
  'library-marketplace': {
    nominal: {
      reviewObjective: 'Verify that the versioned IO-cell release has sufficient provenance, licensing, view consistency and qualification evidence for controlled reuse.',
      decisionQuestion: 'May this library version enter the qualified internal registry for the declared PDK and flow?',
      assumptions: 'The manifest checksum covers every distributed view.\nThe Apache license and notices apply to all included cells.\nQualification used the exact published archive.',
      acceptanceCriteria: 'LEF, Liberty, GDS, CDL and Verilog views are mutually consistent.\nDRC/LVS and flow regressions are traceable.\nPDK, tool and corner compatibility are explicit.\nLicense and checksum review are independently approved.',
      reviewerContext: 'Qualification is scoped to the declared PDK and tool flow. Do not generalize successful open-flow testing to foundry signoff.',
    },
    optimization: {
      reviewObjective: 'Assess a low-power cell library for characterized PPA value, integration risk, license obligations and view completeness.',
      decisionQuestion: 'Should this release be admitted as an optimization candidate, and what restrictions must accompany its use?',
      assumptions: 'All 84 cells are included in the characterization matrix.\nThreshold and supply variants are correctly named and modeled.\nNOTICE obligations are complete.',
      acceptanceCriteria: 'Characterization covers required PVT and transition/load ranges.\nViews pass consistency, DRC and LVS checks.\nPPA comparisons use equivalent circuits and constraints.\nRegistry metadata states qualification scope and restrictions.',
      reviewerContext: 'Challenge extrapolated Liberty tables, missing EM/antenna limits, incomplete sequential checks and any PPA claim without a controlled baseline.',
    },
    signoff: {
      reviewObjective: 'Perform an independent release-candidate audit for an SRAM compiler package before entitlement-controlled use.',
      decisionQuestion: 'Which licensing, checksum, view-consistency or characterization gaps block registry approval?',
      assumptions: 'The commercial entitlement permits evaluation but not unrestricted redistribution.\nThe manifest enumerates all generated macro variants.\nQualification reports correspond to version 3.0.2.',
      acceptanceCriteria: 'Verify entitlement and access controls.\nRecompute archive and per-view checksums.\nConfirm GDS/LEF/CDL/Liberty consistency for sampled variants.\nCover required corners, DRC/LVS, antenna, EM and integration regressions.',
      reviewerContext: 'Treat licensing and technical qualification as separate mandatory gates. Approval in one domain cannot compensate for failure in the other.',
    },
    highRisk: {
      reviewObjective: 'Assess whether an unverified legacy RF macro package should be quarantined, rejected or admitted only for forensic evaluation.',
      decisionQuestion: 'What evidence is missing, what risks are non-negotiable, and is any controlled use defensible?',
      assumptions: 'Ownership and redistribution rights are unknown.\nThe PDK mapping is not established.\nThe supplied manifest is the only available evidence.',
      acceptanceCriteria: 'Do not admit to the qualified registry without verified license rights.\nEstablish PDK and layer-map compatibility.\nRecompute checksums and run view-consistency, DRC and LVS checks.\nRequire RF characterization and reliability evidence appropriate to intended use.',
      reviewerContext: 'Default to quarantine. Do not infer quality from naming, prior use claims or checksum presence without trusted provenance.',
    },
  },
};

const SCENARIOS: Array<{ key: ScenarioKey; label: string; color: 'primary' | 'success' | 'warning' | 'error' }> = [
  { key: 'nominal', label: 'Fill reference case', color: 'primary' },
  { key: 'optimization', label: 'Fill optimization case', color: 'success' },
  { key: 'signoff', label: 'Fill signoff challenge', color: 'warning' },
  { key: 'highRisk', label: 'Fill critical exception', color: 'error' },
];

function scenarioValues(feature: CommercialFeature, key: ScenarioKey): Values {
  const values = { ...configurations[feature][key], ...AI_CONTEXT_BY_FEATURE[feature][key] };
  const expectedKeys = [...configurations[feature].fields, ...AI_CONTEXT_FIELDS].map(field => field.key);
  const missing = expectedKeys.filter(fieldKey => !values[fieldKey]?.trim());
  if (missing.length) throw new Error(`Incomplete ${feature}/${key} preset: ${missing.join(', ')}`);
  return values;
}

// Fail during development/build instead of shipping a scenario button that
// silently leaves required evidence or optional AI-review context blank.
(Object.keys(configurations) as CommercialFeature[]).forEach(feature => {
  SCENARIOS.forEach(({ key }) => { scenarioValues(feature, key); });
});

const lines = (value: string) => value.split('\n').map(item => item.trim()).filter(Boolean);
const num = (value: string) => Number(value);

export default function CommercialFeaturePage({ feature }: { feature: CommercialFeature }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const config = configurations[feature];
  const [workspace, setWorkspace] = useState<WorkspaceBundle | null>(null);
  const [projectId, setProjectId] = useState('');
  const [values, setValues] = useState<Values>(() => scenarioValues(feature, 'nominal'));
  const [selectedScenario, setSelectedScenario] = useState<ScenarioKey | null>('nominal');
  const [saved, setSaved] = useState<Record<string, unknown> | null>(null);
  const [brief, setBrief] = useState<DecisionBrief | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/workspace/bootstrap');
      const data = await response.json();
      if (response.status === 401) {
        router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
        return;
      }
      if (!response.ok) throw new Error(data.message ?? data.error ?? 'Unable to load workspace');
      setWorkspace(data.workspace);
      setProjectId((current: string) => current || data.workspace.projects[0]?.id || '');
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : 'Unable to load workspace'); }
    finally { setLoading(false); }
  }, [pathname, router]);
  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
      return;
    }
    void load();
  }, [authLoading, isAuthenticated, load, pathname, router]);

  const body = useMemo(() => {
    const evidence = lines(values.evidence ?? '');
    if (feature === 'ppa') return { projectId, commitSha: values.commitSha, branch: values.branch, message: values.message, author: values.author, areaUm2: num(values.areaUm2), powerMw: num(values.powerMw), wnsNs: num(values.wnsNs), tnsNs: num(values.tnsNs), drcCount: num(values.drcCount), congestionPct: num(values.congestionPct), thresholds: { areaPct: 3, powerPct: 5, wnsNs: -0.03, drc: 2, congestionPct: 5 }, evidence };
    if (feature === 'rtl-impact') return { projectId, baseSha: values.baseSha, targetSha: values.targetSha, changedModules: lines(values.changedModules), timingDeltaNs: num(values.timingDeltaNs), powerDeltaPct: num(values.powerDeltaPct), congestionDeltaPct: num(values.congestionDeltaPct), drcDelta: num(values.drcDelta), affectedPaths: lines(values.affectedPaths), evidence };
    const payload = Object.fromEntries(Object.entries(values).filter(([key]) => !['title', 'evidence'].includes(key) && !AI_CONTEXT_KEYS.has(key)).map(([key, value]) => [key, config.fields.find(field => field.key === key)?.type === 'number' ? num(value) : value]));
    return { projectId, recordType: feature === 'spice-regression' ? 'regression-suite' : feature === 'co-design' ? 'review-session' : 'library-release', title: values.title, status: feature === 'library-marketplace' ? 'review' : feature === 'co-design' ? 'active' : num(values.failed) > 0 ? 'attention' : 'passed', payload, evidence };
  }, [config.fields, feature, projectId, values]);

  const fillScenario = (key: ScenarioKey, label: string) => {
    setValues(scenarioValues(feature, key));
    setSelectedScenario(key);
    setSaved(null);
    setBrief(null);
    setError('');
    setNotice(`${label} loaded. Required engineering evidence and all optional AI review fields are populated.`);
  };

  const submit = async () => {
    setSaving(true); setError(''); setNotice(''); setBrief(null);
    try {
      const response = await fetch(config.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? data.error ?? 'Save failed');
      const record = data.snapshot ?? data.impact ?? data.record;
      setSaved(record); setNotice('Evidence-backed record saved. AI review is available as a separate, explicit action.');
      await load();
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : 'Save failed'); }
    finally { setSaving(false); }
  };

  const analyze = async () => {
    if (!saved) return;
    setAnalyzing(true); setError('');
    try {
      const response = await fetch('/api/workspace/ai-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          feature,
          title: config.title,
          context: saved,
          evidence: lines(values.evidence ?? ''),
          reviewRequest: {
            objective: values.reviewObjective ?? '',
            decisionQuestion: values.decisionQuestion ?? '',
            assumptions: lines(values.assumptions ?? ''),
            acceptanceCriteria: lines(values.acceptanceCriteria ?? ''),
            reviewerContext: values.reviewerContext ?? '',
          },
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? data.error ?? 'AI review failed');
      setBrief(data.brief);
    } catch (analysisError) { setError(analysisError instanceof Error ? analysisError.message : 'AI review failed'); }
    finally { setAnalyzing(false); }
  };

  const decideReview = async (status: 'accepted' | 'rejected', rationale: string) => {
    if (!brief?.id) throw new Error('Save the AI review before recording a human decision');
    const response = await fetch('/api/workspace/ai-review', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: brief.id, status, rationale }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message ?? data.error ?? 'Human decision could not be recorded');
    setBrief(data.brief);
    setNotice(`Human review ${status}. The rationale was added to the tenant audit trail.`);
  };

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Typography variant="overline" color="primary">Commercial design workspace</Typography>
      <Typography variant="h3" fontWeight={800}>{config.title}</Typography>
      <Typography color="text.secondary" sx={{ mt: 1, mb: 3, maxWidth: 900 }}>{config.subtitle}</Typography>
      {authLoading || !isAuthenticated || loading ? <CircularProgress /> : !workspace?.projects.length ? <Alert severity="warning">Create a workspace project before using this workflow.</Alert> : (
        <Card variant="outlined"><CardContent>
          <Typography variant="h6" fontWeight={750}>Complete scenario presets</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 1.5 }}>
            Each preset fills every engineering field plus the optional instructions used by the OpenRouter specialist and challenger passes.
          </Typography>
          <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mb: 2 }}>
            {SCENARIOS.map(scenario => (
              <Button
                key={scenario.key}
                color={scenario.color}
                variant={selectedScenario === scenario.key ? 'contained' : 'outlined'}
                startIcon={<Science />}
                onClick={() => fillScenario(scenario.key, scenario.label)}
              >
                {scenario.label}
              </Button>
            ))}
            <Button color="inherit" variant="outlined" startIcon={<DeleteSweep />} onClick={() => { setValues({}); setSelectedScenario(null); setSaved(null); setBrief(null); setError(''); setNotice('All engineering and optional AI fields cleared.'); }}>Clear all fields</Button>
          </Stack>
          <FormControl fullWidth sx={{ mb: 2 }}><InputLabel>Workspace project</InputLabel><Select value={projectId} label="Workspace project" onChange={event => setProjectId(event.target.value)}>{workspace.projects.map(item => <MenuItem key={item.id} value={item.id}>{item.name} · {item.pdkRef}</MenuItem>)}</Select></FormControl>
          <Grid container spacing={2}>{config.fields.map(field => <Grid key={field.key} size={{ xs: 12, md: field.type === 'multiline' ? 12 : 6 }}><TextField fullWidth required value={values[field.key] ?? ''} label={field.label} type={field.type === 'number' ? 'number' : 'text'} multiline={field.type === 'multiline'} minRows={field.type === 'multiline' ? 3 : undefined} helperText={field.helper} onChange={event => { setValues(current => ({ ...current, [field.key]: event.target.value })); setSelectedScenario(null); }} /></Grid>)}</Grid>
          <Card variant="outlined" sx={{ mt: 3, bgcolor: 'action.hover' }}>
            <CardContent>
              <Typography variant="h6" fontWeight={750}>Optional AI review instructions</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>
                These fields focus the AI request but never override measured evidence, signoff tools, or the accountable human decision.
              </Typography>
              <Grid container spacing={2}>{AI_CONTEXT_FIELDS.map(field => <Grid key={field.key} size={{ xs: 12, md: field.type === 'multiline' ? 12 : 6 }}><TextField fullWidth value={values[field.key] ?? ''} label={field.label} multiline={field.type === 'multiline'} minRows={field.type === 'multiline' ? 3 : undefined} helperText={field.helper} onChange={event => { setValues(current => ({ ...current, [field.key]: event.target.value })); setSelectedScenario(null); }} /></Grid>)}</Grid>
            </CardContent>
          </Card>
          <Stack direction={{ xs: 'column', sm: 'row' }} gap={1.5} sx={{ mt: 3 }}>
            <Button variant="contained" size="large" startIcon={<Save />} disabled={saving || !projectId} onClick={submit}>{saving ? 'Saving…' : config.action}</Button>
            <Button variant="contained" color="secondary" size="large" startIcon={<AutoAwesome />} disabled={!saved || analyzing} onClick={analyze}>{analyzing ? 'OpenRouter is analyzing…' : 'Generate governed AI brief'}</Button>
          </Stack>
          {notice && <Alert severity="success" sx={{ mt: 2 }}>{notice}</Alert>}
          {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
        </CardContent></Card>
      )}
      {brief && <DecisionBriefView brief={brief} onDecision={decideReview} />}
      <Box sx={{ mt: 2 }}><Typography variant="caption" color="text.secondary">AI output is advisory. Foundry qualification, signoff evidence and accountable human approval remain mandatory.</Typography></Box>
    </Container>
  );
}
