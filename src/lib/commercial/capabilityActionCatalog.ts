import type { PlatformCapabilityId } from './capabilities';

export interface CapabilityActionDefinition {
  id: string;
  title: string;
  description: string;
  mode: 'local' | 'adapter' | 'governed-job';
  inputTemplate: Record<string, unknown>;
}

const action = (
  id: string,
  title: string,
  description: string,
  inputTemplate: Record<string, unknown>,
  mode: CapabilityActionDefinition['mode'] = 'local'
): CapabilityActionDefinition => ({ id, title, description, inputTemplate, mode });

export const CAPABILITY_ACTIONS: Record<PlatformCapabilityId, CapabilityActionDefinition[]> = {
  'verification-closure': [
    action(
      'uvm-regression',
      'UVM regression management',
      'Normalize test results, pass rate, runtime and failing seeds.',
      {
        suite: 'nightly-smoke',
        tests: [
          { name: 'boot_test', status: 'passed', runtimeSec: 42 },
          {
            name: 'dma_stress',
            status: 'failed',
            runtimeSec: 113,
            seed: 9281,
            message: 'scoreboard mismatch on channel 2',
          },
        ],
      }
    ),
    action(
      'coverage-closure',
      'Coverage closure',
      'Score functional, code and assertion coverage against explicit targets.',
      {
        metrics: [
          { name: 'functional', value: 94.2, target: 95 },
          { name: 'line', value: 97.1, target: 95 },
          { name: 'assertion', value: 91.4, target: 90 },
        ],
        exclusions: [{ scope: 'debug_fuse', approved: true }],
      }
    ),
    action(
      'formal-results',
      'Formal verification results',
      'Normalize proof, bounded, inconclusive and failed property results.',
      {
        properties: [
          { name: 'fifo_no_overflow', status: 'proven', depth: 38 },
          { name: 'arbiter_eventual_grant', status: 'inconclusive', depth: 120 },
        ],
      }
    ),
    action(
      'failure-clustering',
      'Failure clustering',
      'Cluster regression failures by normalized message similarity.',
      {
        failures: [
          { test: 'dma_stress', seed: 9281, message: 'scoreboard mismatch channel 2 expected 0x4 got 0x7' },
          { test: 'dma_stress', seed: 1442, message: 'scoreboard mismatch channel 3 expected 0x2 got 0x5' },
          { test: 'reset_test', seed: 92, message: 'timeout waiting for reset done' },
        ],
      }
    ),
    action(
      'requirements-trace',
      'Coverage-to-requirement traceability',
      'Reconcile requirements to tests, proofs and measured coverage.',
      {
        requirements: [
          { id: 'REQ-101', tests: ['boot_test'], proofs: [], status: 'covered' },
          { id: 'REQ-204', tests: ['dma_stress'], proofs: ['dma_no_drop'], status: 'partial' },
        ],
      }
    ),
  ],
  'ai-ppa-closure': [
    action(
      'critical-path-analysis',
      'Critical-path root-cause analysis',
      'Rank negative-slack paths and recurring cells/nets.',
      {
        paths: [
          { name: 'mac_to_acc', slackNs: -0.12, delayNs: 1.42, cells: ['MUL_X4', 'AOI21_X1', 'BUF_X1'] },
          { name: 'ctrl_to_gate', slackNs: -0.04, delayNs: 0.91, cells: ['NOR2_X1', 'BUF_X1'] },
        ],
      }
    ),
    action(
      'constraint-recommendations',
      'Constraint recommendations',
      'Detect missing clocks, excessive uncertainty and unconstrained endpoints.',
      {
        clocks: [{ name: 'core_clk', periodNs: 1, uncertaintyNs: 0.18 }],
        unconstrainedEndpoints: ['u_debug/status_reg/D'],
        falsePathCandidates: ['scan_enable -> functional_datapath'],
      }
    ),
    action(
      'eco-recommendations',
      'ECO recommendations',
      'Generate bounded ECO candidates from measured path and congestion evidence.',
      {
        violations: [
          { domain: 'setup', path: 'mac_to_acc', slackNs: -0.12, fanout: 18 },
          { domain: 'congestion', region: 'R12C8', utilizationPct: 86 },
        ],
      }
    ),
    action(
      'pareto-optimization',
      'Multi-objective PPA optimization',
      'Compute the non-dominated area, power and timing frontier.',
      {
        candidates: [
          { id: 'base', areaUm2: 850000, powerMw: 190, wnsNs: -0.02 },
          { id: 'retime', areaUm2: 858000, powerMw: 194, wnsNs: 0.04 },
          { id: 'low-power', areaUm2: 846000, powerMw: 174, wnsNs: 0.01 },
        ],
      }
    ),
    action(
      'sandbox-rerun',
      'Automatic sandbox rerun',
      'Submit a bounded Yosys/OpenROAD job through the governed queue.',
      {
        edaProjectId: 'replace-with-governed-eda-project-id',
        kind: 'yosys',
        idempotencyKey: 'capability-rerun-001',
        expectedCpuSeconds: 300,
        retentionDays: 30,
        inputs: {
          'design.v': 'module top(input clk, input d, output reg q); always @(posedge clk) q <= d; endmodule',
          'flow.ys': 'read_verilog design.v\nhierarchy -top top\nsynth -top top\nstat',
        },
      },
      'governed-job'
    ),
  ],
  'enterprise-integrations': [
    action(
      'scm-status-publish',
      'GitHub/GitLab status publishing',
      'Publish a commit status through a deployment-configured SCM adapter.',
      {
        provider: 'github',
        repository: 'example/chip',
        sha: '0123456789abcdef0123456789abcdef01234567',
        state: 'success',
        context: 'neuralchip/signoff',
        description: 'Governed checks passed',
      },
      'adapter'
    ),
    action(
      'jira-sync',
      'Jira ticket synchronization',
      'Create or update a governed engineering issue through the Jira adapter.',
      {
        operation: 'upsert',
        externalKey: 'CHIP-142',
        summary: 'Resolve hold regression at ff corner',
        status: 'In Progress',
        labels: ['signoff', 'timing'],
      },
      'adapter'
    ),
    action(
      'notification-delivery',
      'Slack/email notification delivery',
      'Deliver a bounded notification and retain the provider receipt.',
      {
        channels: ['slack', 'email'],
        subject: 'Tapeout gate requires review',
        message: 'Two signoff checks remain unresolved.',
        recipients: ['signoff-team'],
      },
      'adapter'
    ),
    action(
      'identity-activation',
      'SAML/OIDC, SCIM and MFA activation',
      'Verify identity metadata, provisioning and MFA policy with the configured identity adapter.',
      {
        protocol: 'oidc',
        issuer: 'https://identity.example.com',
        audience: 'neuralchip',
        scimEnabled: true,
        mfaRequired: true,
      },
      'adapter'
    ),
    action(
      'kms-rotation-verify',
      'Customer KMS verification and rotation',
      'Verify encryption round trip and key rotation through the configured KMS adapter.',
      { keyReference: 'alias/chip-artifacts', rotationRequested: false, verificationObject: 'kms-probe.txt' },
      'adapter'
    ),
  ],
  'power-thermal-signoff': [
    action(
      'power-intent-ingest',
      'UPF/CPF power-intent ingestion',
      'Parse domains, supplies, isolation, retention and level-shifter intent.',
      {
        format: 'upf',
        content:
          'create_power_domain PD_CORE -elements {u_core}\ncreate_supply_net VDD_CORE\nset_isolation ISO_CORE -domain PD_CORE\nset_retention RET_CORE -domain PD_CORE',
      }
    ),
    action(
      'power-state-analysis',
      'Power-state and DVFS analysis',
      'Check state completeness, voltage validity and transition coverage.',
      {
        states: [
          { name: 'performance', voltage: 0.9, frequencyMhz: 1200, allowedFrom: ['nominal'] },
          { name: 'nominal', voltage: 0.8, frequencyMhz: 800, allowedFrom: ['performance', 'retention'] },
          { name: 'retention', voltage: 0.55, frequencyMhz: 0, allowedFrom: ['nominal'] },
        ],
      }
    ),
    action(
      'dynamic-power-estimate',
      'Dynamic power estimation',
      'Estimate dynamic and leakage power from activity and capacitance.',
      {
        voltage: 0.8,
        frequencyMhz: 800,
        blocks: [
          { name: 'mac', capacitancePf: 420, activity: 0.35, leakageMw: 8.2 },
          { name: 'sram', capacitancePf: 180, activity: 0.12, leakageMw: 5.1 },
        ],
      }
    ),
    action(
      'thermal-map',
      'Thermal map and EM/IR correlation',
      'Solve a bounded steady-state grid and correlate electrical hotspots.',
      {
        ambientC: 35,
        thermalResistanceCPerW: 0.42,
        grid: [
          [2.1, 3.4, 2.8],
          [2.7, 6.2, 3.1],
          [1.9, 3.0, 2.2],
        ],
        emIrHotspots: [{ row: 1, col: 1, severity: 'high' }],
      }
    ),
    action(
      'cooling-impact',
      'Battery and cooling impact',
      'Project energy, battery life and cooling headroom from workload duty cycles.',
      {
        batteryWh: 60,
        coolingCapacityW: 18,
        workloads: [
          { name: 'inference', powerW: 12, dutyCycle: 0.65 },
          { name: 'idle', powerW: 2.1, dutyCycle: 0.35 },
        ],
      }
    ),
  ],
  'rtl-ip-management': [
    action('ip-catalog', 'Reusable IP catalog', 'Normalize IP releases, views, ownership and qualification state.', {
      ip: [
        {
          name: 'axi_dma',
          version: '2.4.1',
          owner: 'soc-team',
          views: ['rtl', 'sdc', 'lef'],
          license: 'Apache-2.0',
          checksum: 'a'.repeat(64),
        },
      ],
    }),
    action(
      'dependency-risk-scan',
      'Dependency, license and vulnerability tracking',
      'Score an SBOM against supplied license and vulnerability policy.',
      {
        packages: [
          { name: 'soft-cpu', version: '1.2.0', license: 'Apache-2.0', vulnerabilities: [] },
          {
            name: 'legacy-usb',
            version: '0.9.1',
            license: 'GPL-3.0',
            vulnerabilities: [{ id: 'CVE-TEST-1', severity: 'high' }],
          },
        ],
        deniedLicenses: ['GPL-3.0'],
      }
    ),
    action(
      'pr-impact',
      'RTL impact on every pull request',
      'Create a downstream analysis decision from PR and PPA deltas.',
      {
        pullRequest: 42,
        baseSha: 'abc1234',
        headSha: 'def5678',
        changedModules: ['mac_array'],
        timingDeltaNs: -0.04,
        powerDeltaPct: 3.2,
        congestionDeltaPct: 5.8,
        drcDelta: 2,
      }
    ),
    action(
      'compatibility-provenance',
      'Version compatibility and provenance',
      'Validate required views, PDK ranges and checksums.',
      {
        pdk: 'sky130A@1.0.0',
        tools: { yosys: '0.48', openroad: '2.0' },
        components: [
          {
            name: 'sram_1rw',
            version: '3.1',
            pdk: 'sky130A@1.0.0',
            requiredViews: ['liberty', 'lef', 'gds', 'verilog'],
            availableViews: ['liberty', 'lef', 'gds', 'verilog'],
            checksumVerified: true,
          },
        ],
      }
    ),
    action(
      'third-party-access',
      'Secure third-party IP access',
      'Evaluate least-privilege grants, expiry and export restrictions.',
      {
        grants: [
          {
            subject: 'contractor-a',
            ip: 'pcie-controller',
            permissions: ['read'],
            expiresAt: '2026-09-01T00:00:00Z',
            exportAllowed: false,
          },
        ],
      }
    ),
  ],
  'analog-mixed-signal': [
    action(
      'spice-netlist-import',
      'SPICE netlist import',
      'Parse bounded SPICE elements, models, subcircuits and analyses.',
      { netlist: '* RC filter\nV1 in 0 PULSE(0 1.8 0 1n 1n 10n 20n)\nR1 in out 1k\nC1 out 0 2p\n.tran 0.1n 100n\n.end' }
    ),
    action(
      'waveform-analysis',
      'Waveform viewer and measurements',
      'Normalize waveform points and compute min/max/mean/rise time.',
      {
        signal: 'v(out)',
        unit: 'V',
        points: [
          { timeNs: 0, value: 0 },
          { timeNs: 1, value: 0.2 },
          { timeNs: 2, value: 0.9 },
          { timeNs: 3, value: 1.6 },
          { timeNs: 4, value: 1.79 },
        ],
      }
    ),
    action(
      'monte-carlo-yield',
      'Monte Carlo yield distribution',
      'Compute distribution statistics and specification yield.',
      {
        metric: 'read_margin_mv',
        lowerSpec: 80,
        upperSpec: 200,
        samples: [122, 115, 131, 98, 144, 126, 118, 73, 152, 109],
      }
    ),
    action(
      'pex-comparison',
      'Parasitic extraction comparison',
      'Compare schematic and extracted measurements with tolerance checks.',
      {
        tolerancePct: 5,
        measurements: [
          { name: 'gain_db', schematic: 42.1, extracted: 40.4 },
          { name: 'ugb_mhz', schematic: 88, extracted: 79 },
        ],
      }
    ),
    action('analog-regression', 'Analog regression dashboard', 'Aggregate corner tests, failures and worst margin.', {
      runs: [
        { corner: 'tt_1p8_25', passed: 42, failed: 0, marginPct: 18 },
        { corner: 'ss_1p62_125', passed: 39, failed: 3, marginPct: -4.2 },
        { corner: 'ff_1p98_m40', passed: 42, failed: 0, marginPct: 11 },
      ],
    }),
  ],
  'chiplet-packaging': [
    action(
      'chiplet-floorplan',
      '2.5D/3D floorplanning',
      'Check die placement, overlap, interposer bounds and stacking metadata.',
      {
        interposer: { widthMm: 40, heightMm: 30 },
        dies: [
          { name: 'compute', xMm: 2, yMm: 3, widthMm: 14, heightMm: 12, tier: 0 },
          { name: 'io', xMm: 19, yMm: 3, widthMm: 9, heightMm: 12, tier: 0 },
        ],
      }
    ),
    action(
      'ucie-interface',
      'UCIe interface planning',
      'Size links from bandwidth, lane rate, encoding and redundancy.',
      { links: [{ name: 'compute-io', requiredGbps: 512, laneGbps: 32, encodingEfficiency: 0.94, spareLanePct: 12.5 }] }
    ),
    action(
      'die-link-analysis',
      'Die-to-die latency and bandwidth',
      'Estimate serialization, propagation and protocol latency.',
      {
        links: [
          { name: 'compute-io', payloadBytes: 256, lanes: 20, laneGbps: 32, distanceMm: 22, protocolOverheadNs: 8 },
        ],
      }
    ),
    action(
      'package-si-pi-thermal',
      'Package SI/PI and thermal model',
      'Score insertion loss, impedance, droop and junction temperature.',
      {
        insertionLossDb: 4.2,
        targetImpedanceOhm: 0.02,
        measuredImpedanceOhm: 0.027,
        voltageDroopPct: 4.8,
        maxJunctionC: 92,
        limitC: 105,
      }
    ),
    action(
      'package-cost',
      'Bump, RDL, interposer and package cost',
      'Estimate package unit cost and known-good assembly yield.',
      {
        volume: 100000,
        substrateCost: 18,
        interposerCost: 24,
        assemblyCost: 9,
        testCost: 5,
        dieYields: [0.92, 0.95],
        assemblyYield: 0.97,
      }
    ),
  ],
  'silicon-yield-feedback': [
    action('wafer-map-ingest', 'Wafer-map ingestion', 'Normalize die coordinates, bins and gross/net yield.', {
      dies: [
        { x: 0, y: 0, bin: 'pass' },
        { x: 1, y: 0, bin: 'pass' },
        { x: 2, y: 0, bin: 'timing' },
        { x: 0, y: 1, bin: 'power' },
        { x: 1, y: 1, bin: 'pass' },
      ],
    }),
    action('lot-bin-analytics', 'Lot and test-bin analytics', 'Compute lot yield, bin pareto and outlier lots.', {
      lots: [
        { id: 'L101', tested: 1200, bins: { pass: 1080, timing: 72, power: 48 } },
        { id: 'L102', tested: 1180, bins: { pass: 1004, timing: 126, power: 50 } },
      ],
    }),
    action(
      'rtl-silicon-compare',
      'RTL-to-silicon metric comparison',
      'Compare predicted and measured performance, power and margin.',
      {
        metrics: [
          { name: 'frequency_mhz', predicted: 1000, measured: 930, tolerancePct: 5 },
          { name: 'power_w', predicted: 8.4, measured: 9.1, tolerancePct: 8 },
        ],
      }
    ),
    action(
      'failure-analysis',
      'Failure-analysis workflow',
      'Prioritize failures by frequency, severity and evidence completeness.',
      {
        failures: [
          {
            id: 'FA-1',
            symptom: 'boot fail at cold',
            count: 28,
            severity: 4,
            evidence: ['shmoo.csv'],
            owner: 'product-eng',
          },
          { id: 'FA-2', symptom: 'high idle current', count: 9, severity: 5, evidence: [], owner: '' },
        ],
      }
    ),
    action(
      'yield-rule-feedback',
      'Yield-learning design-rule feedback',
      'Convert recurring spatial/bin signatures into reviewable rule candidates.',
      {
        patterns: [
          {
            signature: 'edge timing fallout',
            affectedDies: 84,
            correlation: 0.82,
            proposedRule: 'increase edge clock margin by 25 ps',
          },
        ],
      }
    ),
  ],
  'tapeout-release': [
    action(
      'foundry-checklist',
      'Foundry checklist templates',
      'Evaluate mandatory release checklist items and accountable owners.',
      {
        items: [
          { id: 'DRC', required: true, status: 'complete', owner: 'pv-lead' },
          { id: 'LVS', required: true, status: 'complete', owner: 'pv-lead' },
          { id: 'WAIVERS', required: true, status: 'pending', owner: 'tapeout-manager' },
        ],
      }
    ),
    action(
      'pdk-deck-lock',
      'PDK/deck version locking',
      'Create immutable digests for the exact PDK and rule-deck references.',
      {
        references: [
          { kind: 'pdk', name: 'foundry16', version: '4.2', sha256: 'a'.repeat(64) },
          { kind: 'drc-deck', name: 'drc', version: '2026.07', sha256: 'b'.repeat(64) },
        ],
      }
    ),
    action(
      'signed-manifest',
      'Signed tapeout manifest',
      'Canonicalize and cryptographically sign the release manifest.',
      {
        release: 'atlas-rc1',
        commitSha: '0123456789abcdef0123456789abcdef01234567',
        artifacts: [
          { name: 'atlas.gds', sha256: 'c'.repeat(64), sizeBytes: 1024000 },
          { name: 'atlas.v', sha256: 'd'.repeat(64), sizeBytes: 82000 },
        ],
      }
    ),
    action(
      'gds-oasis-verify',
      'Final GDS/OASIS package verification',
      'Reconcile expected hashes, sizes and stream metadata.',
      {
        files: [
          {
            name: 'atlas.gds',
            format: 'gds',
            expectedSha256: 'c'.repeat(64),
            actualSha256: 'c'.repeat(64),
            expectedSize: 1024000,
            actualSize: 1024000,
          },
        ],
      }
    ),
    action(
      'release-ceremony',
      'Approval ceremony and immutable bundle',
      'Check evidence, approvals, manifest signature and release decision.',
      {
        manifestRecordId: 'select-retained-signed-manifest',
      }
    ),
  ],
  'resource-cost-optimization': [
    action('license-utilization', 'EDA license utilization', 'Compute utilization, denial rate and peak concurrency.', {
      pools: [
        { tool: 'sta', licenses: 20, peakUsed: 19, denials: 14, requests: 420 },
        { tool: 'pnr', licenses: 12, peakUsed: 9, denials: 0, requests: 96 },
      ],
    }),
    action(
      'queue-forecast',
      'Compute queue forecasting',
      'Forecast wait and completion time from capacity and queued work.',
      { workers: 8, averageRuntimeMin: 42, queuedJobs: 31, arrivalRatePerHour: 7 }
    ),
    action('cloud-cost', 'Cloud-run cost estimation', 'Estimate compute, storage, egress and license cost.', {
      runs: 120,
      cpuHoursPerRun: 5.5,
      cpuRatePerHour: 0.82,
      storageGb: 640,
      storageRatePerGbMonth: 0.023,
      egressGb: 90,
      egressRatePerGb: 0.09,
      licenseCostPerRun: 14,
    }),
    action(
      'budget-quota',
      'Project budgets and quotas',
      'Compare consumption to project budgets and warning thresholds.',
      {
        budgetUsd: 25000,
        spentUsd: 18750,
        computeQuotaHours: 4000,
        computeUsedHours: 3360,
        storageQuotaGb: 1000,
        storageUsedGb: 720,
      }
    ),
    action(
      'capacity-recommendation',
      'Run cancellation and capacity recommendation',
      'Prioritize queued work and optionally request governed job cancellation.',
      {
        jobs: [
          { id: 'run-1', priority: 5, progress: 10, expectedCpuSeconds: 3600, requiredEvidence: false },
          { id: 'run-2', priority: 10, progress: 65, expectedCpuSeconds: 7200, requiredEvidence: true },
        ],
        availableWorkerHours: 2,
        cancelJobId: '',
      },
      'governed-job'
    ),
  ],
};

export function capabilityAction(
  capabilityId: PlatformCapabilityId,
  actionId: string
): CapabilityActionDefinition | undefined {
  return CAPABILITY_ACTIONS[capabilityId].find((item) => item.id === actionId);
}
