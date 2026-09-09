import { createHash, createPrivateKey, sign as cryptoSign } from 'crypto';
import { z } from 'zod';
import { createJob, requestCancellation } from '@/lib/eda/store';
import type { EdaIdentity } from '@/lib/eda/identity';
import type { PlatformCapabilityId } from './capabilities';
import { capabilityAction } from './capabilityActionCatalog';
import { canonicalRelease, releaseManifestSchema, verifyReleasePrerequisites } from './release';

export type CapabilityExecutionStatus = 'completed' | 'submitted' | 'blocked' | 'configuration-required';

export interface CapabilityVisualization {
  type: 'line' | 'heatmap' | 'wafer' | 'bars';
  title: string;
  xLabel?: string;
  yLabel?: string;
  points?: Array<{ x: number; y: number; label?: string }>;
  grid?: number[][];
  cells?: Array<{ x: number; y: number; value: number; label: string }>;
  bars?: Array<{ label: string; value: number }>;
}

export interface CapabilityExecutionResult {
  capabilityId: PlatformCapabilityId;
  actionId: string;
  status: CapabilityExecutionStatus;
  summary: string;
  metrics: Record<string, string | number | boolean>;
  findings: string[];
  recommendations: string[];
  data: Record<string, unknown>;
  visualization?: CapabilityVisualization;
  adapterReceipt?: Record<string, unknown>;
}

const inputSchema = z
  .record(z.unknown())
  .refine((value) => JSON.stringify(value).length <= 100_000, 'Input exceeds 100 KB');

function object(value: unknown, label: string): Record<string, unknown> {
  const parsed = z.record(z.unknown()).safeParse(value);
  if (!parsed.success) throw new Error(`${label} must be an object`);
  return parsed.data;
}

function objects(value: unknown, label: string, max = 10_000): Record<string, unknown>[] {
  if (!Array.isArray(value) || value.length > max)
    throw new Error(`${label} must be an array with at most ${max} items`);
  return value.map((item, index) => object(item, `${label}[${index}]`));
}

function numberValue(value: unknown, label: string): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label} must be a finite number`);
  return parsed;
}

function stringValue(value: unknown, label: string, max = 20_000): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max)
    throw new Error(`${label} must be a non-empty string`);
  return value.trim();
}

function strings(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value.map((item, index) => stringValue(item, `${label}[${index}]`, 500));
}

function round(value: number, digits = 2): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function mean(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function deviation(values: number[]): number {
  if (values.length < 2) return 0;
  const average = mean(values);
  return Math.sqrt(values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1));
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function result(
  capabilityId: PlatformCapabilityId,
  actionId: string,
  summary: string,
  options: Partial<Omit<CapabilityExecutionResult, 'capabilityId' | 'actionId' | 'summary'>> = {}
): CapabilityExecutionResult {
  return {
    capabilityId,
    actionId,
    status: options.status ?? 'completed',
    summary,
    metrics: options.metrics ?? {},
    findings: options.findings ?? [],
    recommendations: options.recommendations ?? [],
    data: options.data ?? {},
    visualization: options.visualization,
    adapterReceipt: options.adapterReceipt,
  };
}

function normalizeFailure(message: string): string {
  return message
    .toLowerCase()
    .replace(/0x[0-9a-f]+|\b\d+\b/g, '#')
    .replace(/[^a-z#]+/g, ' ')
    .trim();
}

function adapterEnvironmentName(actionId: string, suffix: 'URL' | 'TOKEN'): string {
  return `CHIP_${actionId.toUpperCase().replaceAll('-', '_')}_ADAPTER_${suffix}`;
}

async function executeAdapter(
  capabilityId: PlatformCapabilityId,
  actionId: string,
  input: Record<string, unknown>
): Promise<CapabilityExecutionResult> {
  const urlName = adapterEnvironmentName(actionId, 'URL');
  const tokenName = adapterEnvironmentName(actionId, 'TOKEN');
  const adapterUrl = process.env[urlName] ?? process.env.CHIP_ENTERPRISE_ADAPTER_URL;
  const adapterToken = process.env[tokenName] ?? process.env.CHIP_ENTERPRISE_ADAPTER_TOKEN;
  const missing = [!adapterUrl ? urlName : '', !adapterToken ? tokenName : ''].filter(Boolean);
  if (missing.length) {
    return result(
      capabilityId,
      actionId,
      `The ${actionId} adapter is implemented but not activated in this deployment.`,
      {
        status: 'configuration-required',
        metrics: { configured: false },
        findings: [`Missing deployment secret/configuration: ${missing.join(', ')}`],
        recommendations: [
          'Configure the adapter endpoint and token in the deployment secret store, then rerun the verification round trip.',
        ],
        data: { requiredConfiguration: missing },
      }
    );
  }
  const parsedUrl = new URL(adapterUrl!);
  if (process.env.NODE_ENV === 'production' && parsedUrl.protocol !== 'https:')
    throw new Error('Production capability adapters must use HTTPS');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(parsedUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adapterToken}` },
      body: JSON.stringify({ action: actionId, payload: input }),
      signal: controller.signal,
    });
    const raw = (await response.text()).slice(0, 50_000);
    let receipt: Record<string, unknown> = { body: raw };
    try {
      receipt = object(JSON.parse(raw), 'adapter response');
    } catch {
      /* Retain bounded text body. */
    }
    if (!response.ok) {
      return result(capabilityId, actionId, `The ${actionId} provider rejected the operation.`, {
        status: 'blocked',
        metrics: { httpStatus: response.status },
        findings: [`Adapter returned HTTP ${response.status}.`],
        recommendations: ['Resolve the provider response and retry with the same idempotency reference.'],
        data: {},
        adapterReceipt: receipt,
      });
    }
    return result(capabilityId, actionId, `The ${actionId} adapter completed a provider round trip.`, {
      status: 'completed',
      metrics: { configured: true, httpStatus: response.status },
      findings: [],
      recommendations: [
        'Retain and independently verify the provider receipt before treating the integration action as complete.',
      ],
      data: {},
      adapterReceipt: receipt,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function executeCapabilityAction(args: {
  identity: EdaIdentity;
  projectId?: string;
  capabilityId: PlatformCapabilityId;
  actionId: string;
  input: Record<string, unknown>;
}): Promise<CapabilityExecutionResult> {
  const { identity, capabilityId, actionId } = args;
  const input = inputSchema.parse(args.input);
  const definition = capabilityAction(capabilityId, actionId);
  if (!definition) throw new Error(`Unsupported capability action: ${capabilityId}/${actionId}`);
  if (definition.mode === 'adapter') return executeAdapter(capabilityId, actionId, input);

  switch (actionId) {
    case 'uvm-regression': {
      const tests = objects(input.tests, 'tests');
      const failed = tests.filter((test) => String(test.status).toLowerCase() !== 'passed');
      const runtime = tests.reduce((sum, test) => sum + numberValue(test.runtimeSec ?? 0, 'runtimeSec'), 0);
      return result(capabilityId, actionId, `${tests.length - failed.length}/${tests.length} UVM tests passed.`, {
        status: failed.length ? 'blocked' : 'completed',
        metrics: {
          tests: tests.length,
          passed: tests.length - failed.length,
          failed: failed.length,
          passRatePct: round(((tests.length - failed.length) / Math.max(1, tests.length)) * 100),
          runtimeSec: runtime,
        },
        findings: failed.map(
          (test) => `${String(test.name)}: ${String(test.message ?? 'failed without a diagnostic')}`
        ),
        recommendations: failed.length
          ? ['Rerun each failure with its retained seed and waveform before closure.']
          : ['Retain the simulator/version manifest and regression log.'],
        data: { failedTests: failed },
      });
    }
    case 'coverage-closure': {
      const metrics = objects(input.metrics, 'metrics').map((metric) => ({
        name: String(metric.name),
        value: numberValue(metric.value, 'coverage value'),
        target: numberValue(metric.target, 'coverage target'),
      }));
      const gaps = metrics.filter((metric) => metric.value < metric.target);
      return result(
        capabilityId,
        actionId,
        gaps.length ? `${gaps.length} coverage target(s) remain open.` : 'All configured coverage targets are met.',
        {
          status: gaps.length ? 'blocked' : 'completed',
          metrics: { averageCoveragePct: round(mean(metrics.map((metric) => metric.value))), openTargets: gaps.length },
          findings: gaps.map((gap) => `${gap.name}: ${gap.value}% is below ${gap.target}%`),
          recommendations: gaps.map(
            (gap) =>
              `Add targeted stimulus or proof for ${gap.name}; do not lower the target without reviewed exclusion evidence.`
          ),
          data: { metrics, exclusions: input.exclusions ?? [] },
          visualization: {
            type: 'bars',
            title: 'Coverage by domain',
            bars: metrics.map((metric) => ({ label: metric.name, value: metric.value })),
          },
        }
      );
    }
    case 'formal-results': {
      const properties = objects(input.properties, 'properties');
      const counts = Object.fromEntries(
        ['proven', 'failed', 'inconclusive', 'bounded'].map((status) => [
          status,
          properties.filter((property) => property.status === status).length,
        ])
      );
      const open = properties.filter((property) => property.status !== 'proven');
      return result(capabilityId, actionId, `${counts.proven}/${properties.length} formal properties are proven.`, {
        status: open.length ? 'blocked' : 'completed',
        metrics: counts,
        findings: open.map((property) => `${String(property.name)}: ${String(property.status)}`),
        recommendations: open.map(
          (property) =>
            `Resolve ${String(property.name)} with deeper bounds, assumptions review, decomposition, or a counterexample fix.`
        ),
        data: { properties },
      });
    }
    case 'failure-clustering': {
      const failures = objects(input.failures, 'failures');
      const clusters = new Map<string, Record<string, unknown>[]>();
      for (const failure of failures) {
        const key = normalizeFailure(String(failure.message ?? 'unknown failure'));
        clusters.set(key, [...(clusters.get(key) ?? []), failure]);
      }
      const ranked = [...clusters.entries()]
        .map(([signature, items]) => ({
          signature,
          count: items.length,
          tests: [...new Set(items.map((item) => String(item.test)))],
          seeds: items.map((item) => item.seed),
        }))
        .sort((left, right) => right.count - left.count);
      return result(
        capabilityId,
        actionId,
        `${failures.length} failures collapsed into ${ranked.length} signature cluster(s).`,
        {
          metrics: { failures: failures.length, clusters: ranked.length, largestCluster: ranked[0]?.count ?? 0 },
          findings: ranked.map((cluster) => `${cluster.count} × ${cluster.signature}`),
          recommendations: ranked
            .slice(0, 3)
            .map(
              (cluster) => `Triage the ${cluster.signature} cluster with representative seeds and linked waveforms.`
            ),
          data: { clusters: ranked },
          visualization: {
            type: 'bars',
            title: 'Failure clusters',
            bars: ranked.map((cluster) => ({ label: cluster.signature.slice(0, 40), value: cluster.count })),
          },
        }
      );
    }
    case 'requirements-trace': {
      const requirements = objects(input.requirements, 'requirements');
      const uncovered = requirements.filter(
        (requirement) =>
          !['covered', 'verified', 'proven'].includes(String(requirement.status)) ||
          (!Array.isArray(requirement.tests) && !Array.isArray(requirement.proofs))
      );
      return result(
        capabilityId,
        actionId,
        `${requirements.length - uncovered.length}/${requirements.length} requirements have closure evidence.`,
        {
          status: uncovered.length ? 'blocked' : 'completed',
          metrics: {
            requirements: requirements.length,
            closed: requirements.length - uncovered.length,
            open: uncovered.length,
            traceabilityPct: round(((requirements.length - uncovered.length) / Math.max(1, requirements.length)) * 100),
          },
          findings: uncovered.map(
            (requirement) => `${String(requirement.id)} is ${String(requirement.status ?? 'unmapped')}`
          ),
          recommendations: uncovered.map(
            (requirement) => `Link ${String(requirement.id)} to an executable test or proof and retain the result.`
          ),
          data: { requirements },
        }
      );
    }
    case 'critical-path-analysis': {
      const paths = objects(input.paths, 'paths').map((path) => ({
        ...path,
        name: String(path.name ?? 'unnamed-path'),
        slackNs: numberValue(path.slackNs, 'slackNs'),
        delayNs: numberValue(path.delayNs, 'delayNs'),
        cells: strings(path.cells, 'cells'),
      }));
      const violating = paths.filter((path) => path.slackNs < 0).sort((left, right) => left.slackNs - right.slackNs);
      const cellCount = new Map<string, number>();
      paths.forEach((path) => path.cells.forEach((cell) => cellCount.set(cell, (cellCount.get(cell) ?? 0) + 1)));
      const recurring = [...cellCount.entries()].sort((left, right) => right[1] - left[1]);
      return result(
        capabilityId,
        actionId,
        `${violating.length} critical path(s) violate timing; worst slack is ${violating[0]?.slackNs ?? 0} ns.`,
        {
          status: violating.length ? 'blocked' : 'completed',
          metrics: {
            paths: paths.length,
            violating: violating.length,
            worstSlackNs: violating[0]?.slackNs ?? Math.min(...paths.map((path) => path.slackNs)),
            recurringCell: recurring[0]?.[0] ?? 'none',
          },
          findings: violating.map(
            (path) => `${String(path.name)}: ${path.slackNs} ns across ${path.cells.join(' → ')}`
          ),
          recommendations: recurring
            .slice(0, 3)
            .map(
              ([cell, count]) => `Inspect ${cell}, recurring on ${count} path(s), before proposing a localized ECO.`
            ),
          data: { violating, recurringCells: recurring },
        }
      );
    }
    case 'constraint-recommendations': {
      const clocks = objects(input.clocks, 'clocks');
      const unconstrained = Array.isArray(input.unconstrainedEndpoints)
        ? strings(input.unconstrainedEndpoints, 'unconstrainedEndpoints')
        : [];
      const findings = [
        ...unconstrained.map((endpoint) => `Unconstrained endpoint: ${endpoint}`),
        ...clocks
          .filter(
            (clock) =>
              numberValue(clock.uncertaintyNs ?? 0, 'uncertaintyNs') / numberValue(clock.periodNs, 'periodNs') > 0.15
          )
          .map((clock) => `${String(clock.name)} uncertainty exceeds 15% of period.`),
      ];
      const recommendations = [
        ...unconstrained.map(
          (endpoint) => `Define a clock, input/output delay, or reviewed exception for ${endpoint}.`
        ),
        ...clocks.map(
          (clock) => `Reconcile ${String(clock.name)} period and uncertainty to characterized source/jitter evidence.`
        ),
      ];
      return result(
        capabilityId,
        actionId,
        findings.length ? 'Constraint review found material gaps.' : 'No deterministic constraint gap was detected.',
        {
          status: findings.length ? 'blocked' : 'completed',
          metrics: { clocks: clocks.length, unconstrainedEndpoints: unconstrained.length },
          findings,
          recommendations,
          data: { clocks, falsePathCandidates: input.falsePathCandidates ?? [] },
        }
      );
    }
    case 'eco-recommendations': {
      const violations = objects(input.violations, 'violations');
      const recommendations = violations.map((violation) =>
        violation.domain === 'setup'
          ? `Evaluate cell sizing, buffering or register balancing on ${String(violation.path)} in a controlled sandbox run.`
          : violation.domain === 'hold'
            ? `Add localized delay on ${String(violation.path)} and verify all fast corners.`
            : `Reduce density or adjust placement/routing resources in ${String(violation.region ?? 'the affected region')}.`
      );
      return result(capabilityId, actionId, `${recommendations.length} bounded ECO experiment(s) generated.`, {
        status: 'completed',
        metrics: { candidates: recommendations.length },
        findings: violations.map((item) => `${String(item.domain)} violation retained as measured input.`),
        recommendations,
        data: {
          experiments: recommendations.map((recommendation, index) => ({
            id: `eco-${index + 1}`,
            recommendation,
            verified: false,
          })),
        },
      });
    }
    case 'pareto-optimization': {
      const candidates = objects(input.candidates, 'candidates').map((candidate) => ({
        id: String(candidate.id),
        areaUm2: numberValue(candidate.areaUm2, 'areaUm2'),
        powerMw: numberValue(candidate.powerMw, 'powerMw'),
        wnsNs: numberValue(candidate.wnsNs, 'wnsNs'),
      }));
      const frontier = candidates.filter(
        (candidate) =>
          !candidates.some(
            (other) =>
              other.id !== candidate.id &&
              other.areaUm2 <= candidate.areaUm2 &&
              other.powerMw <= candidate.powerMw &&
              other.wnsNs >= candidate.wnsNs &&
              (other.areaUm2 < candidate.areaUm2 || other.powerMw < candidate.powerMw || other.wnsNs > candidate.wnsNs)
          )
      );
      return result(capabilityId, actionId, `${frontier.length}/${candidates.length} candidates are non-dominated.`, {
        metrics: {
          candidates: candidates.length,
          paretoCandidates: frontier.length,
          timingClosed: frontier.filter((item) => item.wnsNs >= 0).length,
        },
        findings: candidates
          .filter((candidate) => !frontier.includes(candidate))
          .map((candidate) => `${candidate.id} is dominated on area, power and timing.`),
        recommendations: frontier.map(
          (candidate) =>
            `${candidate.id}: verify across identical MCMM, activity and physical conditions before selection.`
        ),
        data: { frontier, candidates },
        visualization: {
          type: 'line',
          title: 'Area vs power candidates',
          xLabel: 'Area (µm²)',
          yLabel: 'Power (mW)',
          points: candidates.map((candidate) => ({ x: candidate.areaUm2, y: candidate.powerMw, label: candidate.id })),
        },
      });
    }
    case 'sandbox-rerun': {
      const edaProjectId = stringValue(input.edaProjectId, 'edaProjectId', 100);
      if (edaProjectId === 'replace-with-governed-eda-project-id') {
        throw new Error('Select a tenant-owned governed EDA project before submitting the sandbox rerun');
      }
      const job = createJob(identity, {
        projectId: edaProjectId,
        kind: z.enum(['yosys', 'openroad', 'simulation', 'formal']).parse(input.kind),
        idempotencyKey: stringValue(input.idempotencyKey, 'idempotencyKey', 128),
        inputs: z.record(z.string()).parse(input.inputs),
        expectedCpuSeconds: numberValue(input.expectedCpuSeconds ?? 300, 'expectedCpuSeconds'),
        retentionDays: numberValue(input.retentionDays ?? 30, 'retentionDays'),
      });
      return result(capabilityId, actionId, `Governed ${job.kind} sandbox job ${job.id} was ${job.status}.`, {
        status: 'submitted',
        metrics: { expectedCpuSeconds: job.expectedCpuSeconds, progress: job.progress },
        findings:
          job.status === 'awaiting_approval'
            ? ['The cost threshold requires independent approval before execution.']
            : [],
        recommendations: ['Compare the completed job against the exact baseline before accepting the proposed change.'],
        data: { job },
      });
    }
    case 'power-intent-ingest': {
      const format = z.enum(['upf', 'cpf']).parse(input.format);
      const content = stringValue(input.content, 'content', 100_000);
      const commands = content
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#'));
      const counts = {
        domains: commands.filter((line) => /create_power_domain|create power domain/i.test(line)).length,
        supplies: commands.filter((line) => /supply/i.test(line)).length,
        isolation: commands.filter((line) => /isolation/i.test(line)).length,
        retention: commands.filter((line) => /retention/i.test(line)).length,
        levelShifters: commands.filter((line) => /level_shift/i.test(line)).length,
      };
      const findings =
        counts.domains && counts.supplies
          ? []
          : ['Power intent is missing at least one power domain or supply declaration.'];
      return result(capabilityId, actionId, `Parsed ${commands.length} ${format.toUpperCase()} statement(s).`, {
        status: findings.length ? 'blocked' : 'completed',
        metrics: counts,
        findings,
        recommendations: ['Run power-aware structural and simulation checks against the exact parsed intent.'],
        data: { format, commands },
      });
    }
    case 'power-state-analysis': {
      const states = objects(input.states, 'states').map((state) => ({
        name: String(state.name),
        voltage: numberValue(state.voltage, 'voltage'),
        frequencyMhz: numberValue(state.frequencyMhz, 'frequencyMhz'),
        allowedFrom: strings(state.allowedFrom ?? [], 'allowedFrom'),
      }));
      const names = new Set(states.map((state) => state.name));
      const broken = states.flatMap((state) =>
        state.allowedFrom
          .filter((source) => !names.has(source))
          .map((source) => `${state.name} references missing source state ${source}`)
      );
      const unsafe = states
        .filter((state) => state.voltage <= 0 || state.frequencyMhz < 0)
        .map((state) => `${state.name} has invalid voltage/frequency.`);
      return result(
        capabilityId,
        actionId,
        `${states.length} power state(s) and ${states.reduce((sum, state) => sum + state.allowedFrom.length, 0)} transition(s) analyzed.`,
        {
          status: broken.length || unsafe.length ? 'blocked' : 'completed',
          metrics: {
            states: states.length,
            transitions: states.reduce((sum, state) => sum + state.allowedFrom.length, 0),
            maxFrequencyMhz: Math.max(...states.map((state) => state.frequencyMhz)),
          },
          findings: [...broken, ...unsafe],
          recommendations: [
            'Verify every legal and illegal transition with isolation, retention, reset and clock sequencing evidence.',
          ],
          data: { states },
        }
      );
    }
    case 'dynamic-power-estimate': {
      const voltage = numberValue(input.voltage, 'voltage');
      const frequencyHz = numberValue(input.frequencyMhz, 'frequencyMhz') * 1e6;
      const blocks = objects(input.blocks, 'blocks').map((block) => {
        const dynamicMw =
          numberValue(block.capacitancePf, 'capacitancePf') *
          1e-12 *
          voltage ** 2 *
          frequencyHz *
          numberValue(block.activity, 'activity') *
          1e3;
        return {
          name: String(block.name),
          dynamicMw: round(dynamicMw, 3),
          leakageMw: numberValue(block.leakageMw ?? 0, 'leakageMw'),
        };
      });
      const dynamicMw = blocks.reduce((sum, block) => sum + block.dynamicMw, 0);
      const leakageMw = blocks.reduce((sum, block) => sum + block.leakageMw, 0);
      return result(capabilityId, actionId, `Estimated ${round(dynamicMw + leakageMw, 3)} mW total power.`, {
        metrics: {
          dynamicMw: round(dynamicMw, 3),
          leakageMw: round(leakageMw, 3),
          totalMw: round(dynamicMw + leakageMw, 3),
        },
        findings: [
          'This estimate depends directly on supplied capacitance and activity; it is not vector-based signoff.',
        ],
        recommendations: ['Replace assumed activity and capacitance with tool-derived, scenario-specific evidence.'],
        data: { blocks },
        visualization: {
          type: 'bars',
          title: 'Estimated block power',
          bars: blocks.map((block) => ({ label: block.name, value: round(block.dynamicMw + block.leakageMw, 3) })),
        },
      });
    }
    case 'thermal-map': {
      const grid = z.array(z.array(z.number().nonnegative()).min(1).max(50)).min(1).max(50).parse(input.grid);
      const ambient = numberValue(input.ambientC, 'ambientC');
      const resistance = numberValue(input.thermalResistanceCPerW, 'thermalResistanceCPerW');
      const temperatures = grid.map((row) => row.map((power) => round(ambient + power * resistance, 2)));
      const maxTemp = Math.max(...temperatures.flat());
      const hotspots = objects(input.emIrHotspots ?? [], 'emIrHotspots');
      return result(
        capabilityId,
        actionId,
        `Steady-state grid solved; maximum estimated temperature is ${maxTemp} °C.`,
        {
          metrics: {
            rows: grid.length,
            columns: Math.max(...grid.map((row) => row.length)),
            maxTemperatureC: maxTemp,
            correlatedElectricalHotspots: hotspots.length,
          },
          findings: hotspots.map(
            (hotspot) =>
              `Electrical hotspot at row ${String(hotspot.row)}, column ${String(hotspot.col)} requires correlated review.`
          ),
          recommendations: [
            'Verify with package boundary conditions, spatial power maps and a qualified thermal solver.',
          ],
          data: { temperatures, hotspots },
          visualization: { type: 'heatmap', title: 'Estimated junction temperature (°C)', grid: temperatures },
        }
      );
    }
    case 'cooling-impact': {
      const workloads = objects(input.workloads, 'workloads').map((workload) => ({
        name: String(workload.name),
        powerW: numberValue(workload.powerW, 'powerW'),
        dutyCycle: numberValue(workload.dutyCycle, 'dutyCycle'),
      }));
      const averagePower = workloads.reduce((sum, workload) => sum + workload.powerW * workload.dutyCycle, 0);
      const batteryHours = numberValue(input.batteryWh, 'batteryWh') / Math.max(averagePower, 1e-9);
      const cooling = numberValue(input.coolingCapacityW, 'coolingCapacityW');
      return result(
        capabilityId,
        actionId,
        `Average load is ${round(averagePower)} W with ${round(batteryHours)} projected battery hours.`,
        {
          status: averagePower > cooling ? 'blocked' : 'completed',
          metrics: {
            averagePowerW: round(averagePower),
            projectedBatteryHours: round(batteryHours),
            coolingHeadroomW: round(cooling - averagePower),
          },
          findings: averagePower > cooling ? ['Average workload power exceeds configured cooling capacity.'] : [],
          recommendations: ['Validate transient peaks, regulator losses, battery derating and ambient conditions.'],
          data: { workloads },
        }
      );
    }
    case 'ip-catalog': {
      const ip = objects(input.ip, 'ip');
      const invalid = ip.filter(
        (item) => !/^[0-9a-f]{64}$/.test(String(item.checksum ?? '')) || !Array.isArray(item.views)
      );
      return result(
        capabilityId,
        actionId,
        `${ip.length - invalid.length}/${ip.length} IP release(s) have a valid manifest checksum and view list.`,
        {
          status: invalid.length ? 'blocked' : 'completed',
          metrics: { releases: ip.length, invalid: invalid.length },
          findings: invalid.map((item) => `${String(item.name)} lacks valid checksum/view provenance.`),
          recommendations: ['Qualify Liberty/LEF/GDS/CDL/RTL consistency before implementation use.'],
          data: { ip },
        }
      );
    }
    case 'dependency-risk-scan': {
      const packages = objects(input.packages, 'packages');
      const denied = new Set(strings(input.deniedLicenses ?? [], 'deniedLicenses'));
      const risks = packages.flatMap((pkg) => {
        const findings: string[] = [];
        if (denied.has(String(pkg.license)))
          findings.push(`${String(pkg.name)} uses denied license ${String(pkg.license)}.`);
        for (const vulnerability of objects(pkg.vulnerabilities ?? [], 'vulnerabilities'))
          findings.push(`${String(pkg.name)}: ${String(vulnerability.id)} (${String(vulnerability.severity)})`);
        return findings;
      });
      return result(
        capabilityId,
        actionId,
        risks.length
          ? `${risks.length} dependency policy finding(s) require disposition.`
          : 'Dependency policy checks passed.',
        {
          status: risks.length ? 'blocked' : 'completed',
          metrics: { packages: packages.length, findings: risks.length },
          findings: risks,
          recommendations: risks.map((finding) => `Resolve or independently waive: ${finding}`),
          data: { packages },
        }
      );
    }
    case 'pr-impact': {
      const score =
        (numberValue(input.timingDeltaNs, 'timingDeltaNs') < -0.03 ? 3 : 0) +
        (numberValue(input.powerDeltaPct, 'powerDeltaPct') > 5 ? 3 : 0) +
        (numberValue(input.congestionDeltaPct, 'congestionDeltaPct') > 5 ? 3 : 0) +
        (numberValue(input.drcDelta, 'drcDelta') > 0 ? 2 : 0);
      const risk = score >= 8 ? 'critical' : score >= 5 ? 'high' : score >= 2 ? 'moderate' : 'low';
      return result(
        capabilityId,
        actionId,
        `Pull request ${String(input.pullRequest)} has ${risk} downstream implementation risk.`,
        {
          status: score >= 5 ? 'blocked' : 'completed',
          metrics: {
            riskScore: score,
            timingDeltaNs: numberValue(input.timingDeltaNs, 'timingDeltaNs'),
            powerDeltaPct: numberValue(input.powerDeltaPct, 'powerDeltaPct'),
            congestionDeltaPct: numberValue(input.congestionDeltaPct, 'congestionDeltaPct'),
            drcDelta: numberValue(input.drcDelta, 'drcDelta'),
          },
          findings: score ? [`Measured deltas produce a ${risk} risk classification.`] : [],
          recommendations: score
            ? ['Require a controlled governed implementation run before merge.']
            : ['Publish the evidence-backed status to the SCM adapter.'],
          data: { changedModules: input.changedModules ?? [] },
        }
      );
    }
    case 'compatibility-provenance': {
      const components = objects(input.components, 'components');
      const gaps = components.flatMap((component) => {
        const required = strings(component.requiredViews ?? [], 'requiredViews');
        const available = new Set(strings(component.availableViews ?? [], 'availableViews'));
        return [
          ...required.filter((view) => !available.has(view)).map((view) => `${String(component.name)} missing ${view}`),
          ...(!component.checksumVerified ? [`${String(component.name)} checksum is unverified`] : []),
          ...(component.pdk !== input.pdk
            ? [`${String(component.name)} targets ${String(component.pdk)}, not ${String(input.pdk)}`]
            : []),
        ];
      });
      return result(
        capabilityId,
        actionId,
        gaps.length
          ? 'Component compatibility gaps were detected.'
          : 'All supplied components satisfy the configured compatibility checks.',
        {
          status: gaps.length ? 'blocked' : 'completed',
          metrics: { components: components.length, gaps: gaps.length },
          findings: gaps,
          recommendations: gaps.map((gap) => `Block integration until resolved: ${gap}`),
          data: { components, pdk: input.pdk, tools: input.tools },
        }
      );
    }
    case 'third-party-access': {
      const now = Date.now();
      const grants = objects(input.grants, 'grants');
      const unsafe = grants.filter(
        (grant) =>
          !grant.expiresAt ||
          Date.parse(String(grant.expiresAt)) <= now ||
          (Array.isArray(grant.permissions) && grant.permissions.includes('write')) ||
          grant.exportAllowed === true
      );
      return result(
        capabilityId,
        actionId,
        `${grants.length - unsafe.length}/${grants.length} third-party grant(s) meet the bounded access policy.`,
        {
          status: unsafe.length ? 'blocked' : 'completed',
          metrics: { grants: grants.length, unsafe: unsafe.length },
          findings: unsafe.map(
            (grant) =>
              `${String(grant.subject)} grant for ${String(grant.ip)} is expired or exceeds read-only/no-export policy.`
          ),
          recommendations: ['Use time-bounded, least-privilege grants and retain access/audit receipts.'],
          data: { grants },
        }
      );
    }
    case 'spice-netlist-import': {
      const netlist = stringValue(input.netlist, 'netlist', 500_000);
      const lines = netlist
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('*'));
      const elements = lines.filter((line) => /^[RCLVIMQDX]\S*/i.test(line));
      const analyses = lines.filter((line) => /^\.(tran|ac|dc|noise|op)\b/i.test(line));
      const subcircuits = lines.filter((line) => /^\.subckt\b/i.test(line));
      return result(
        capabilityId,
        actionId,
        `Imported ${elements.length} SPICE element(s), ${subcircuits.length} subcircuit(s), and ${analyses.length} analysis directive(s).`,
        {
          status: elements.length && analyses.length ? 'completed' : 'blocked',
          metrics: { elements: elements.length, subcircuits: subcircuits.length, analyses: analyses.length },
          findings: analyses.length ? [] : ['No supported analysis directive was found.'],
          recommendations: ['Resolve model includes in an approved, network-isolated simulator workspace.'],
          data: { elements, analyses, subcircuits },
        }
      );
    }
    case 'waveform-analysis': {
      const points = objects(input.points, 'points')
        .map((point) => ({ x: numberValue(point.timeNs, 'timeNs'), y: numberValue(point.value, 'value') }))
        .sort((left, right) => left.x - right.x);
      const values = points.map((point) => point.y);
      const min = Math.min(...values);
      const max = Math.max(...values);
      const low = min + (max - min) * 0.1;
      const high = min + (max - min) * 0.9;
      const lowPoint = points.find((point) => point.y >= low);
      const highPoint = points.find((point) => point.y >= high);
      return result(
        capabilityId,
        actionId,
        `${String(input.signal)} waveform contains ${points.length} normalized point(s).`,
        {
          metrics: {
            minimum: min,
            maximum: max,
            mean: round(mean(values), 4),
            riseTimeNs: lowPoint && highPoint ? round(highPoint.x - lowPoint.x, 4) : 'not found',
          },
          findings: [],
          recommendations: ['Retain simulator, corner, measurement expression and raw waveform provenance.'],
          data: { signal: input.signal, unit: input.unit, points },
          visualization: {
            type: 'line',
            title: `${String(input.signal)} waveform`,
            xLabel: 'Time (ns)',
            yLabel: String(input.unit ?? ''),
            points,
          },
        }
      );
    }
    case 'monte-carlo-yield': {
      const samples = z.array(z.number()).min(2).max(100_000).parse(input.samples);
      const lower = numberValue(input.lowerSpec, 'lowerSpec');
      const upper = numberValue(input.upperSpec, 'upperSpec');
      const passed = samples.filter((sample) => sample >= lower && sample <= upper);
      const bins = Array.from({ length: 10 }, (_, index) => ({
        label: `${round(Math.min(...samples) + ((Math.max(...samples) - Math.min(...samples)) * index) / 10, 1)}`,
        value: 0,
      }));
      const range = Math.max(...samples) - Math.min(...samples) || 1;
      samples.forEach((sample) => {
        bins[Math.min(9, Math.floor(((sample - Math.min(...samples)) / range) * 10))].value += 1;
      });
      return result(
        capabilityId,
        actionId,
        `${passed.length}/${samples.length} Monte Carlo samples meet specification.`,
        {
          status: passed.length === samples.length ? 'completed' : 'blocked',
          metrics: {
            samples: samples.length,
            mean: round(mean(samples), 3),
            sigma: round(deviation(samples), 3),
            yieldPct: round((passed.length / samples.length) * 100),
          },
          findings:
            passed.length < samples.length
              ? [`${samples.length - passed.length} sample(s) fall outside [${lower}, ${upper}].`]
              : [],
          recommendations: [
            'Confirm sample size, randomization, mismatch models and confidence interval before claiming yield.',
          ],
          data: { lowerSpec: lower, upperSpec: upper, samples },
          visualization: { type: 'bars', title: `${String(input.metric)} distribution`, bars: bins },
        }
      );
    }
    case 'pex-comparison': {
      const tolerance = numberValue(input.tolerancePct, 'tolerancePct');
      const measurements = objects(input.measurements, 'measurements').map((item) => {
        const schematic = numberValue(item.schematic, 'schematic');
        const extracted = numberValue(item.extracted, 'extracted');
        const deltaPct = ((extracted - schematic) / Math.max(Math.abs(schematic), 1e-12)) * 100;
        return {
          name: String(item.name),
          schematic,
          extracted,
          deltaPct: round(deltaPct, 3),
          pass: Math.abs(deltaPct) <= tolerance,
        };
      });
      const failed = measurements.filter((item) => !item.pass);
      return result(
        capabilityId,
        actionId,
        `${measurements.length - failed.length}/${measurements.length} extracted measurements are within ${tolerance}%.`,
        {
          status: failed.length ? 'blocked' : 'completed',
          metrics: {
            measurements: measurements.length,
            failed: failed.length,
            worstDeltaPct: round(Math.max(...measurements.map((item) => Math.abs(item.deltaPct))), 3),
          },
          findings: failed.map((item) => `${item.name}: ${item.deltaPct}% extracted delta.`),
          recommendations: failed.map(
            (item) => `Investigate dominant parasitics and layout coupling for ${item.name}.`
          ),
          data: { measurements },
        }
      );
    }
    case 'analog-regression': {
      const runs = objects(input.runs, 'runs').map((run) => ({
        corner: String(run.corner),
        passed: numberValue(run.passed, 'passed'),
        failed: numberValue(run.failed, 'failed'),
        marginPct: numberValue(run.marginPct, 'marginPct'),
      }));
      const failures = runs.filter((run) => run.failed > 0 || run.marginPct < 0);
      return result(capabilityId, actionId, `${runs.length - failures.length}/${runs.length} analog corner(s) pass.`, {
        status: failures.length ? 'blocked' : 'completed',
        metrics: {
          corners: runs.length,
          passedTests: runs.reduce((sum, run) => sum + run.passed, 0),
          failedTests: runs.reduce((sum, run) => sum + run.failed, 0),
          worstMarginPct: Math.min(...runs.map((run) => run.marginPct)),
        },
        findings: failures.map((run) => `${run.corner}: ${run.failed} failures, ${run.marginPct}% margin.`),
        recommendations: failures.map((run) => `Inspect waveforms, models and extracted parasitics at ${run.corner}.`),
        data: { runs },
        visualization: {
          type: 'bars',
          title: 'Analog margin by corner',
          bars: runs.map((run) => ({ label: run.corner, value: run.marginPct })),
        },
      });
    }
    case 'chiplet-floorplan': {
      const interposer = object(input.interposer, 'interposer');
      const width = numberValue(interposer.widthMm, 'widthMm');
      const height = numberValue(interposer.heightMm, 'heightMm');
      const dies = objects(input.dies, 'dies').map((die) => ({
        name: String(die.name),
        x: numberValue(die.xMm, 'xMm'),
        y: numberValue(die.yMm, 'yMm'),
        width: numberValue(die.widthMm, 'widthMm'),
        height: numberValue(die.heightMm, 'heightMm'),
        tier: numberValue(die.tier ?? 0, 'tier'),
      }));
      const findings: string[] = [];
      dies.forEach((die, index) => {
        if (die.x < 0 || die.y < 0 || die.x + die.width > width || die.y + die.height > height)
          findings.push(`${die.name} exceeds interposer bounds.`);
        dies
          .slice(index + 1)
          .filter(
            (other) =>
              other.tier === die.tier &&
              die.x < other.x + other.width &&
              die.x + die.width > other.x &&
              die.y < other.y + other.height &&
              die.y + die.height > other.y
          )
          .forEach((other) => findings.push(`${die.name} overlaps ${other.name} on tier ${die.tier}.`));
      });
      return result(
        capabilityId,
        actionId,
        `${dies.length} die(s) occupy ${round((dies.reduce((sum, die) => sum + die.width * die.height, 0) / (width * height)) * 100)}% of interposer area.`,
        {
          status: findings.length ? 'blocked' : 'completed',
          metrics: {
            dies: dies.length,
            utilizationPct: round(
              (dies.reduce((sum, die) => sum + die.width * die.height, 0) / (width * height)) * 100
            ),
            tiers: new Set(dies.map((die) => die.tier)).size,
          },
          findings,
          recommendations: [
            'Add keep-outs, bump maps, routing channels, warpage and thermal constraints before package signoff.',
          ],
          data: { interposer: { width, height }, dies },
        }
      );
    }
    case 'ucie-interface': {
      const links = objects(input.links, 'links').map((link) => {
        const required = numberValue(link.requiredGbps, 'requiredGbps');
        const lane = numberValue(link.laneGbps, 'laneGbps');
        const efficiency = numberValue(link.encodingEfficiency, 'encodingEfficiency');
        const spare = numberValue(link.spareLanePct ?? 0, 'spareLanePct');
        const baseLanes = Math.ceil(required / (lane * efficiency));
        const lanes = Math.ceil(baseLanes * (1 + spare / 100));
        return {
          name: String(link.name),
          requiredGbps: required,
          laneGbps: lane,
          baseLanes,
          recommendedLanes: lanes,
          deliveredGbps: round(lanes * lane * efficiency),
        };
      });
      return result(
        capabilityId,
        actionId,
        `${links.length} UCIe link plan(s) sized with encoding and spare-lane margin.`,
        {
          metrics: {
            links: links.length,
            totalLanes: links.reduce((sum, link) => sum + link.recommendedLanes, 0),
            deliveredGbps: round(links.reduce((sum, link) => sum + link.deliveredGbps, 0)),
          },
          findings: [],
          recommendations: ['Verify lane repair, protocol, PHY power, bump escape and package loss budgets.'],
          data: { links },
        }
      );
    }
    case 'die-link-analysis': {
      const links = objects(input.links, 'links').map((link) => {
        const payloadBits = numberValue(link.payloadBytes, 'payloadBytes') * 8;
        const bandwidthGbps = numberValue(link.lanes, 'lanes') * numberValue(link.laneGbps, 'laneGbps');
        const serializationNs = payloadBits / bandwidthGbps;
        const propagationNs = numberValue(link.distanceMm, 'distanceMm') * 0.006;
        const latencyNs = serializationNs + propagationNs + numberValue(link.protocolOverheadNs, 'protocolOverheadNs');
        return {
          name: String(link.name),
          bandwidthGbps: round(bandwidthGbps),
          serializationNs: round(serializationNs, 3),
          propagationNs: round(propagationNs, 3),
          totalLatencyNs: round(latencyNs, 3),
        };
      });
      return result(capabilityId, actionId, `Analyzed ${links.length} die-to-die link(s).`, {
        metrics: {
          aggregateBandwidthGbps: round(links.reduce((sum, link) => sum + link.bandwidthGbps, 0)),
          worstLatencyNs: Math.max(...links.map((link) => link.totalLatencyNs)),
        },
        findings: [],
        recommendations: [
          'Add protocol queuing, retry, clock-domain and package extraction results for signoff-quality latency.',
        ],
        data: { links },
        visualization: {
          type: 'bars',
          title: 'Die-link latency',
          bars: links.map((link) => ({ label: link.name, value: link.totalLatencyNs })),
        },
      });
    }
    case 'package-si-pi-thermal': {
      const impedanceRatio =
        numberValue(input.measuredImpedanceOhm, 'measuredImpedanceOhm') /
        numberValue(input.targetImpedanceOhm, 'targetImpedanceOhm');
      const tempMargin = numberValue(input.limitC, 'limitC') - numberValue(input.maxJunctionC, 'maxJunctionC');
      const findings = [
        numberValue(input.insertionLossDb, 'insertionLossDb') > 6
          ? 'Insertion loss exceeds the 6 dB planning guardrail.'
          : '',
        impedanceRatio > 1 ? `Measured impedance is ${round((impedanceRatio - 1) * 100)}% above target.` : '',
        numberValue(input.voltageDroopPct, 'voltageDroopPct') > 5 ? 'Voltage droop exceeds 5%.' : '',
        tempMargin < 0 ? 'Junction temperature exceeds the configured limit.' : '',
      ].filter(Boolean);
      return result(
        capabilityId,
        actionId,
        findings.length
          ? 'Package SI/PI/thermal planning checks found blockers.'
          : 'Package planning metrics satisfy configured guardrails.',
        {
          status: findings.length ? 'blocked' : 'completed',
          metrics: {
            insertionLossDb: numberValue(input.insertionLossDb, 'insertionLossDb'),
            impedanceRatio: round(impedanceRatio, 3),
            voltageDroopPct: numberValue(input.voltageDroopPct, 'voltageDroopPct'),
            thermalMarginC: tempMargin,
          },
          findings,
          recommendations: [
            'Replace planning values with extracted package models, frequency sweeps and qualified thermal boundary conditions.',
          ],
          data: {},
        }
      );
    }
    case 'package-cost': {
      const dieYields = z.array(z.number().min(0).max(1)).parse(input.dieYields);
      const assemblyYield = numberValue(input.assemblyYield, 'assemblyYield');
      const yieldProduct = dieYields.reduce((product, value) => product * value, assemblyYield);
      const rawCost = ['substrateCost', 'interposerCost', 'assemblyCost', 'testCost'].reduce(
        (sum, key) => sum + numberValue(input[key], key),
        0
      );
      const goodUnitCost = rawCost / Math.max(yieldProduct, 1e-6);
      const volume = numberValue(input.volume, 'volume');
      return result(capabilityId, actionId, `Estimated known-good packaged unit cost is $${round(goodUnitCost)}.`, {
        metrics: {
          rawPackageCostUsd: round(rawCost),
          assemblyYieldPct: round(yieldProduct * 100),
          goodUnitCostUsd: round(goodUnitCost),
          programCostUsd: round(goodUnitCost * volume),
        },
        findings: ['Model excludes die fabrication cost, NRE, logistics, scrap recovery and volume pricing.'],
        recommendations: ['Sensitivity-sweep die and assembly yields before sourcing decisions.'],
        data: { dieYields, assemblyYield },
      });
    }
    case 'wafer-map-ingest': {
      const dies = objects(input.dies, 'dies');
      const bins = new Map<string, number>();
      dies.forEach((die) => bins.set(String(die.bin), (bins.get(String(die.bin)) ?? 0) + 1));
      const passed = bins.get('pass') ?? 0;
      return result(
        capabilityId,
        actionId,
        `Ingested ${dies.length} die(s) with ${round((passed / Math.max(1, dies.length)) * 100)}% gross yield.`,
        {
          status: passed === dies.length ? 'completed' : 'submitted',
          metrics: {
            dies: dies.length,
            passed,
            yieldPct: round((passed / Math.max(1, dies.length)) * 100),
            bins: bins.size,
          },
          findings: [...bins.entries()]
            .filter(([bin]) => bin !== 'pass')
            .map(([bin, count]) => `${count} die(s) in ${bin} bin.`),
          recommendations: ['Correlate spatial signatures with lot, process, probe card and design-margin evidence.'],
          data: { dies, bins: Object.fromEntries(bins) },
          visualization: {
            type: 'wafer',
            title: 'Wafer bin map',
            cells: dies.map((die) => ({
              x: numberValue(die.x, 'x'),
              y: numberValue(die.y, 'y'),
              value: String(die.bin) === 'pass' ? 1 : 0,
              label: String(die.bin),
            })),
          },
        }
      );
    }
    case 'lot-bin-analytics': {
      const lots = objects(input.lots, 'lots').map((lot) => {
        const bins = object(lot.bins, 'bins');
        const tested = numberValue(lot.tested, 'tested');
        const passed = numberValue(bins.pass ?? 0, 'pass');
        return { id: String(lot.id), tested, passed, yieldPct: round((passed / Math.max(1, tested)) * 100), bins };
      });
      const averageYield = mean(lots.map((lot) => lot.yieldPct));
      const outliers = lots.filter((lot) => lot.yieldPct < averageYield - 3);
      return result(
        capabilityId,
        actionId,
        `${lots.length} lot(s) analyzed; average yield is ${round(averageYield)}%.`,
        {
          status: outliers.length ? 'blocked' : 'completed',
          metrics: { lots: lots.length, averageYieldPct: round(averageYield), outlierLots: outliers.length },
          findings: outliers.map((lot) => `${lot.id} yield ${lot.yieldPct}% is more than 3 points below average.`),
          recommendations: outliers.map(
            (lot) => `Open failure analysis for ${lot.id} and compare bin/spatial signatures.`
          ),
          data: { lots },
          visualization: {
            type: 'bars',
            title: 'Yield by lot',
            bars: lots.map((lot) => ({ label: lot.id, value: lot.yieldPct })),
          },
        }
      );
    }
    case 'rtl-silicon-compare': {
      const metrics = objects(input.metrics, 'metrics').map((metric) => {
        const predicted = numberValue(metric.predicted, 'predicted');
        const measured = numberValue(metric.measured, 'measured');
        const deltaPct = ((measured - predicted) / Math.max(Math.abs(predicted), 1e-9)) * 100;
        const tolerance = numberValue(metric.tolerancePct, 'tolerancePct');
        return {
          name: String(metric.name),
          predicted,
          measured,
          deltaPct: round(deltaPct, 3),
          tolerancePct: tolerance,
          pass: Math.abs(deltaPct) <= tolerance,
        };
      });
      const failed = metrics.filter((metric) => !metric.pass);
      return result(
        capabilityId,
        actionId,
        `${metrics.length - failed.length}/${metrics.length} silicon metric(s) match prediction within tolerance.`,
        {
          status: failed.length ? 'blocked' : 'completed',
          metrics: { compared: metrics.length, outsideTolerance: failed.length },
          findings: failed.map(
            (metric) => `${metric.name}: ${metric.deltaPct}% delta exceeds ${metric.tolerancePct}%.`
          ),
          recommendations: failed.map(
            (metric) => `Reconcile model, corner, workload, measurement and guardband assumptions for ${metric.name}.`
          ),
          data: { metrics },
        }
      );
    }
    case 'failure-analysis': {
      const failures = objects(input.failures, 'failures')
        .map((failure) => ({
          ...failure,
          id: String(failure.id ?? 'unidentified-failure'),
          symptom: String(failure.symptom ?? 'unspecified symptom'),
          owner: typeof failure.owner === 'string' ? failure.owner : '',
          priority: numberValue(failure.count, 'count') * numberValue(failure.severity, 'severity'),
          evidence: Array.isArray(failure.evidence) ? failure.evidence : [],
        }))
        .sort((left, right) => right.priority - left.priority);
      const incomplete = failures.filter((failure) => !failure.owner || failure.evidence.length === 0);
      return result(
        capabilityId,
        actionId,
        `${failures.length} failure mode(s) prioritized; ${incomplete.length} lack owner or evidence.`,
        {
          status: incomplete.length ? 'blocked' : 'submitted',
          metrics: {
            failures: failures.length,
            incomplete: incomplete.length,
            topPriority: failures[0]?.priority ?? 0,
          },
          findings: incomplete.map(
            (failure) => `${String(failure.id)} lacks ${!failure.owner ? 'owner' : 'evidence'}.`
          ),
          recommendations: failures
            .slice(0, 3)
            .map(
              (failure) =>
                `Prioritize ${String(failure.id)} (${String(failure.symptom)}) with score ${failure.priority}.`
            ),
          data: { failures },
        }
      );
    }
    case 'yield-rule-feedback': {
      const patterns = objects(input.patterns, 'patterns');
      const candidates = patterns.filter(
        (pattern) =>
          numberValue(pattern.correlation, 'correlation') >= 0.7 &&
          numberValue(pattern.affectedDies, 'affectedDies') >= 20
      );
      return result(
        capabilityId,
        actionId,
        `${candidates.length}/${patterns.length} yield pattern(s) qualify for controlled rule experiments.`,
        {
          status: 'submitted',
          metrics: { patterns: patterns.length, candidates: candidates.length },
          findings: candidates.map(
            (pattern) =>
              `${String(pattern.signature)} correlates at ${round(numberValue(pattern.correlation, 'correlation') * 100)}% across ${String(pattern.affectedDies)} dies.`
          ),
          recommendations: candidates.map(
            (pattern) =>
              `Evaluate "${String(pattern.proposedRule)}" on held-out lots and a controlled design split before adoption.`
          ),
          data: { candidates, patterns },
        }
      );
    }
    case 'foundry-checklist': {
      const items = objects(input.items, 'items');
      const blockers = items.filter((item) => item.required === true && item.status !== 'complete');
      const ownerless = items.filter((item) => !item.owner);
      return result(
        capabilityId,
        actionId,
        `${items.length - blockers.length}/${items.length} checklist item(s) are complete.`,
        {
          status: blockers.length || ownerless.length ? 'blocked' : 'completed',
          metrics: { items: items.length, blockers: blockers.length, ownerless: ownerless.length },
          findings: [
            ...blockers.map((item) => `${String(item.id)} is ${String(item.status)}.`),
            ...ownerless.map((item) => `${String(item.id)} has no accountable owner.`),
          ],
          recommendations: blockers.map((item) => `Close or independently waive ${String(item.id)} before release.`),
          data: { items },
        }
      );
    }
    case 'pdk-deck-lock': {
      const references = objects(input.references, 'references');
      const invalid = references.filter((reference) => !/^[0-9a-f]{64}$/.test(String(reference.sha256 ?? '')));
      const lock = canonical(
        references
          .map((reference) => ({
            kind: reference.kind,
            name: reference.name,
            version: reference.version,
            sha256: reference.sha256,
          }))
          .sort((left, right) => String(left.kind).localeCompare(String(right.kind)))
      );
      return result(
        capabilityId,
        actionId,
        invalid.length
          ? 'PDK/deck lock contains invalid digests.'
          : `Locked ${references.length} PDK/deck reference(s).`,
        {
          status: invalid.length ? 'blocked' : 'completed',
          metrics: { references: references.length, invalid: invalid.length },
          findings: invalid.map(
            (reference) => `${String(reference.kind)}/${String(reference.name)} has an invalid SHA-256.`
          ),
          recommendations: [
            'Store the lock digest with the exact release manifest and verify mounted files before execution.',
          ],
          data: { references, lockDigest: sha256(lock) },
        }
      );
    }
    case 'signed-manifest': {
      if (!args.projectId) return result(capabilityId, actionId, 'Select a workspace project before signing a release manifest.', { status: 'blocked' });
      const manifest = { ...releaseManifestSchema.parse(input), tenantId: identity.tenantId, projectId: args.projectId };
      const document = canonicalRelease(manifest);
      const digest = sha256(document);
      const encodedKey = process.env.CHIP_RELEASE_SIGNING_PRIVATE_KEY_BASE64;
      let signature: string | undefined;
      let keyId: string | undefined;
      if (encodedKey) {
        const key = createPrivateKey(Buffer.from(encodedKey, 'base64'));
        signature = cryptoSign('sha256', Buffer.from(document), key).toString('base64');
        keyId = process.env.CHIP_RELEASE_SIGNING_KEY_ID ?? 'deployment-release-key';
      }
      return result(
        capabilityId,
        actionId,
        signature
          ? 'Release manifest canonicalized and signed with the deployment key.'
          : 'Release manifest canonicalized, but signing is not activated.',
        {
          status: signature ? 'completed' : 'configuration-required',
          metrics: {
            artifacts: Array.isArray(input.artifacts) ? input.artifacts.length : 0,
            signed: Boolean(signature),
          },
          findings: signature
            ? []
            : ['CHIP_RELEASE_SIGNING_PRIVATE_KEY_BASE64 is not configured in the deployment secret store.'],
          recommendations: signature
            ? ['Verify the signature with the independently distributed public key before the release ceremony.']
            : [
                'Configure a protected release signing key and rerun; do not treat the digest alone as an accountable signature.',
              ],
          data: {
            manifest,
            canonicalSha256: digest,
            signature,
            keyId,
            algorithm: signature ? 'SHA256-with-deployment-private-key' : undefined,
          },
        }
      );
    }
    case 'gds-oasis-verify': {
      const files = objects(input.files, 'files').map((file) => ({
        ...file,
        name: String(file.name ?? 'unnamed-stream-file'),
        hashMatch: file.expectedSha256 === file.actualSha256 && /^[0-9a-f]{64}$/.test(String(file.actualSha256)),
        sizeMatch: numberValue(file.expectedSize, 'expectedSize') === numberValue(file.actualSize, 'actualSize'),
      }));
      const failed = files.filter((file) => !file.hashMatch || !file.sizeMatch);
      return result(
        capabilityId,
        actionId,
        `${files.length - failed.length}/${files.length} stream file(s) match expected hash and size.`,
        {
          status: failed.length ? 'blocked' : 'completed',
          metrics: { files: files.length, verified: files.length - failed.length, failed: failed.length },
          findings: failed.map(
            (file) => `${String(file.name)} hashMatch=${file.hashMatch} sizeMatch=${file.sizeMatch}.`
          ),
          recommendations: ['Also verify top cell, units, layer map, hierarchy and foundry-required stream metadata.'],
          data: { files },
        }
      );
    }
    case 'release-ceremony': {
      const selection = z.string().uuid().safeParse(input.manifestRecordId);
      if (!args.projectId || !selection.success) return result(capabilityId, actionId, 'Select a retained signed manifest and obtain its independent release approval.', { status: 'blocked', metrics: { signatureVerified: false, approvals: 0 } });
      const verification = await verifyReleasePrerequisites(identity, args.projectId, selection.data);
      const { ready, approvals, approved, signatureVerified, findings } = verification;
      return result(
        capabilityId,
        actionId,
        ready
          ? 'Release ceremony prerequisites are complete; accountable authorities may make the final release decision.'
          : 'Release ceremony remains blocked.',
        {
          status: ready ? 'completed' : 'blocked',
          metrics: { approvals: approvals.length, approved, signatureVerified },
          findings,
          recommendations: ready
            ? ['Record the final accountable release decision against the immutable evidence bundle.']
            : ['Do not release until every named approval and signature verification is complete.'],
          data: verification,
        }
      );
    }
    case 'license-utilization': {
      const pools = objects(input.pools, 'pools').map((pool) => {
        const licenses = numberValue(pool.licenses, 'licenses');
        const peak = numberValue(pool.peakUsed, 'peakUsed');
        const requests = numberValue(pool.requests, 'requests');
        const denials = numberValue(pool.denials, 'denials');
        return {
          tool: String(pool.tool),
          licenses,
          peakUsed: peak,
          utilizationPct: round((peak / Math.max(1, licenses)) * 100),
          denialRatePct: round((denials / Math.max(1, requests)) * 100),
        };
      });
      const constrained = pools.filter((pool) => pool.utilizationPct > 90 || pool.denialRatePct > 1);
      return result(
        capabilityId,
        actionId,
        `${constrained.length}/${pools.length} license pool(s) are capacity constrained.`,
        {
          status: constrained.length ? 'blocked' : 'completed',
          metrics: { pools: pools.length, constrained: constrained.length },
          findings: constrained.map(
            (pool) => `${pool.tool}: ${pool.utilizationPct}% peak utilization, ${pool.denialRatePct}% denial rate.`
          ),
          recommendations: constrained.map(
            (pool) => `Schedule, rebalance or expand ${pool.tool} capacity using time-series demand evidence.`
          ),
          data: { pools },
          visualization: {
            type: 'bars',
            title: 'Peak license utilization',
            bars: pools.map((pool) => ({ label: pool.tool, value: pool.utilizationPct })),
          },
        }
      );
    }
    case 'queue-forecast': {
      const workers = numberValue(input.workers, 'workers');
      const runtime = numberValue(input.averageRuntimeMin, 'averageRuntimeMin');
      const queued = numberValue(input.queuedJobs, 'queuedJobs');
      const arrivals = numberValue(input.arrivalRatePerHour, 'arrivalRatePerHour');
      const serviceRate = (workers * 60) / runtime;
      const utilization = arrivals / Math.max(serviceRate, 1e-9);
      const drainHours = queued / Math.max(serviceRate - arrivals, 1e-9);
      const waitMin = (queued / Math.max(workers, 1)) * runtime;
      return result(
        capabilityId,
        actionId,
        utilization >= 1
          ? 'Queue demand exceeds steady-state service capacity.'
          : `Estimated queue drain time is ${round(drainHours)} hours.`,
        {
          status: utilization >= 1 ? 'blocked' : 'completed',
          metrics: {
            serviceRatePerHour: round(serviceRate),
            arrivalRatePerHour: arrivals,
            utilizationPct: round(utilization * 100),
            estimatedWaitMin: round(waitMin),
            drainHours: utilization < 1 ? round(drainHours) : 'unbounded',
          },
          findings: utilization >= 1 ? ['Arrival rate is at or above service capacity; queue will not drain.'] : [],
          recommendations: [
            'Reserve capacity for release-critical jobs and validate the forecast against runtime percentiles.',
          ],
          data: {},
        }
      );
    }
    case 'cloud-cost': {
      const runs = numberValue(input.runs, 'runs');
      const compute =
        runs *
        numberValue(input.cpuHoursPerRun, 'cpuHoursPerRun') *
        numberValue(input.cpuRatePerHour, 'cpuRatePerHour');
      const storage =
        numberValue(input.storageGb, 'storageGb') * numberValue(input.storageRatePerGbMonth, 'storageRatePerGbMonth');
      const egress = numberValue(input.egressGb, 'egressGb') * numberValue(input.egressRatePerGb, 'egressRatePerGb');
      const licenses = runs * numberValue(input.licenseCostPerRun, 'licenseCostPerRun');
      const total = compute + storage + egress + licenses;
      return result(capabilityId, actionId, `Estimated workload cost is $${round(total)}.`, {
        metrics: {
          computeUsd: round(compute),
          storageUsd: round(storage),
          egressUsd: round(egress),
          licenseUsd: round(licenses),
          totalUsd: round(total),
          costPerRunUsd: round(total / Math.max(1, runs)),
        },
        findings: ['Estimate excludes taxes, discounts, failed reruns and long-term artifact retention changes.'],
        recommendations: ['Compare estimates with invoiced rates and observed runtime distributions before budgeting.'],
        data: {},
      });
    }
    case 'budget-quota': {
      const budgetPct = (numberValue(input.spentUsd, 'spentUsd') / numberValue(input.budgetUsd, 'budgetUsd')) * 100;
      const computePct =
        (numberValue(input.computeUsedHours, 'computeUsedHours') /
          numberValue(input.computeQuotaHours, 'computeQuotaHours')) *
        100;
      const storagePct =
        (numberValue(input.storageUsedGb, 'storageUsedGb') / numberValue(input.storageQuotaGb, 'storageQuotaGb')) * 100;
      const findings = [
        ['budget', budgetPct],
        ['compute', computePct],
        ['storage', storagePct],
      ]
        .filter(([, value]) => Number(value) >= 85)
        .map(([name, value]) => `${name} consumption is ${round(Number(value))}%.`);
      return result(
        capabilityId,
        actionId,
        findings.length
          ? 'One or more budget/quota warning thresholds are crossed.'
          : 'Budget and quota consumption remain below 85%.',
        {
          status: findings.some((finding) => /1\d\d|[2-9]\d\d/.test(finding)) ? 'blocked' : 'completed',
          metrics: {
            budgetUsedPct: round(budgetPct),
            computeUsedPct: round(computePct),
            storageUsedPct: round(storagePct),
            budgetRemainingUsd: round(
              numberValue(input.budgetUsd, 'budgetUsd') - numberValue(input.spentUsd, 'spentUsd')
            ),
          },
          findings,
          recommendations: findings.map(
            (finding) => `Review forecast and release-critical capacity because ${finding}`
          ),
          data: {},
        }
      );
    }
    case 'capacity-recommendation': {
      const jobs = objects(input.jobs, 'jobs').map((job) => ({
        ...job,
        id: String(job.id ?? 'unidentified-job'),
        requiredEvidence: job.requiredEvidence === true,
        priority: numberValue(job.priority, 'priority'),
        progress: numberValue(job.progress, 'progress'),
        expectedCpuSeconds: numberValue(job.expectedCpuSeconds, 'expectedCpuSeconds'),
      }));
      const availableSeconds = numberValue(input.availableWorkerHours, 'availableWorkerHours') * 3600;
      const ranked = [...jobs].sort(
        (left, right) =>
          right.priority +
          (right.requiredEvidence ? 10 : 0) +
          right.progress / 20 -
          (left.priority + (left.requiredEvidence ? 10 : 0) + left.progress / 20)
      );
      let remaining = availableSeconds;
      const run: string[] = [];
      const defer: string[] = [];
      ranked.forEach((job) => {
        if (job.expectedCpuSeconds <= remaining) {
          run.push(String(job.id));
          remaining -= job.expectedCpuSeconds;
        } else defer.push(String(job.id));
      });
      let cancelled;
      if (typeof input.cancelJobId === 'string' && input.cancelJobId.trim())
        cancelled = requestCancellation(identity, input.cancelJobId.trim());
      return result(
        capabilityId,
        actionId,
        cancelled
          ? `Cancellation requested for ${cancelled.id}; capacity plan recomputed.`
          : `${run.length} job(s) fit available capacity; ${defer.length} should defer.`,
        {
          status: cancelled && !['cancelled', 'succeeded', 'failed'].includes(cancelled.status) ? 'submitted' : 'completed',
          metrics: { runnableJobs: run.length, deferredJobs: defer.length, unusedWorkerHours: round(remaining / 3600) },
          findings: defer.map((id) => `${id} does not fit the supplied capacity window.`),
          recommendations: [
            'Never cancel jobs that produce required release evidence; retain the cancellation audit record.',
          ],
          data: { run, defer, cancelled },
        }
      );
    }
    default:
      throw new Error(`Executor is not implemented for ${actionId}`);
  }
}
