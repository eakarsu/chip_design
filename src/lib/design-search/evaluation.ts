import fs from 'fs';
import { createHash } from 'crypto';
import type { EdaJob } from '@/lib/eda/store';
import { jobWorkspace } from '@/lib/eda/store';
import { readMeasuredMetrics } from '@/lib/eda/measuredMetrics';
import { buildOrfsConfig } from '@/lib/operations/domain';
import type { DesignRevision } from '@/lib/journey/types';

export type SearchObjective = 'min_area' | 'min_power' | 'balanced';
export interface SearchCandidate {
  id: string;
  campaignId: string;
  kind: 'baseline' | 'placement' | 'rtl';
  iteration: number;
  title: string;
  hypothesis: string;
  sourceIds: string[];
  proposedBy: string;
  coreUtilization: number;
  placeDensity: number;
  rtl?: string;
  rtlSourceHash?: string;
  simulationJobId?: string;
  formalJobId?: string;
  proofJobId?: string;
  jobId?: string;
  createdAt: string;
}

export interface CandidateEvaluation extends SearchCandidate {
  status: string;
  qualified: boolean;
  reasons: string[];
  score?: number;
  pareto: boolean;
  metrics?: Record<string, number>;
  reportArtifacts?: Array<{ id: string; relativePath: string; sha256: string }>;
  verification?: { simulationPassed: boolean; formalPassed: boolean; proofPassed?: boolean;
    simulationStatus: string; formalStatus: string; proofStatus?: string };
}

function digest(bytes: Buffer | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function verifiedArtifact(job: EdaJob, relativePath: string): boolean {
  const item = (job.resultManifest?.artifacts as Array<{ relativePath: string; sha256: string; size: number }> | undefined)
    ?.find((artifact) => artifact.relativePath === relativePath);
  if (!item) return false;
  const filename = `${jobWorkspace(job)}/output/${relativePath}`;
  try {
    const stat = fs.lstatSync(filename);
    return stat.isFile() && !stat.isSymbolicLink() && stat.size === item.size && digest(fs.readFileSync(filename)) === item.sha256;
  } catch {
    return false;
  }
}

function recordedInputMatches(job: EdaJob, name: string, content: string): boolean {
  const files = job.inputManifest.files as Array<{ name: string; sha256: string; size: number }> | undefined;
  const file = files?.find((item) => item.name === name);
  return !!file && file.sha256 === digest(content) && file.size === Buffer.byteLength(content);
}

export function evaluateCandidate(
  candidate: SearchCandidate,
  job: EdaJob | undefined,
  revision: DesignRevision,
  objective: SearchObjective,
  expected: { toolImage: string; pdkDigest: string }
): CandidateEvaluation {
  const base = { ...candidate, status: job?.status ?? 'proposed', qualified: false, reasons: [] as string[], pareto: false };
  if (!job) return { ...base, reasons: candidate.jobId ? ['Execution job is missing'] : ['Awaiting dispatch'] };
  if (job.status !== 'succeeded') return { ...base, reasons: [job.error ?? `Job is ${job.status}`] };
  if (job.kind !== 'openroad' || job.projectId !== revision.projectId || job.artifactsExpiredAt ||
      job.toolImage !== expected.toolImage || job.pdkDigest !== expected.pdkDigest)
    return { ...base, reasons: ['Job type, project or retained evidence is invalid'] };
  const config = buildOrfsConfig({ topModule: revision.topModule, platform: 'sky130hd', coreUtilization: candidate.coreUtilization, placeDensity: candidate.placeDensity });
  if (!recordedInputMatches(job, 'design.v', revision.rtl) || !recordedInputMatches(job, 'constraint.sdc', revision.sdc) || !recordedInputMatches(job, 'config.mk', config))
    return { ...base, reasons: ['Job inputs do not match the locked design revision and candidate settings'] };
  if (job.resultManifest?.requestHash !== job.requestHash || job.resultManifest?.toolImage !== job.toolImage || job.resultManifest?.pdkDigest !== job.pdkDigest)
    return { ...base, reasons: ['Job provenance does not match the retained request'] };
  const expectedArtifacts = ['logs/6_report.json', 'reports/5_route_drc.rpt', 'results/6_final.gds'];
  if (!expectedArtifacts.every((file) => verifiedArtifact(job, file)))
    return { ...base, reasons: ['Final report, DRC report or GDS checksum verification failed'] };
  let metrics: Record<string, number>;
  try { metrics = readMeasuredMetrics(`${jobWorkspace(job)}/output`, 'openroad'); }
  catch { return { ...base, reasons: ['Final metric report is unreadable'] }; }
  const recorded = job.resultManifest?.metrics as Record<string, unknown> | undefined;
  if (!recorded || Object.keys(metrics).length === 0 || Object.entries(metrics).some(([key, value]) =>
    typeof recorded[key] !== 'number' || Math.abs(recorded[key] - value) > Math.max(1e-9, Math.abs(value) * 1e-9)))
    return { ...base, reasons: ['Stored metrics do not match the retained tool reports'] };
  const required = ['dieAreaUm2', 'powerMw', 'fmaxMHz', 'setupWnsNs', 'holdWnsNs', 'setupTnsNs', 'holdTnsNs', 'drcViolations', 'flowErrors'];
  if (required.some((key) => !Number.isFinite(metrics[key])) || metrics.dieAreaUm2 <= 0 || metrics.powerMw < 0 || metrics.fmaxMHz <= 0)
    return { ...base, reasons: ['Required physical metrics are incomplete'], metrics };
  const reasons = [
    ...(metrics.setupWnsNs < 0 || metrics.setupTnsNs < 0 ? ['Setup timing failed'] : []),
    ...(metrics.holdWnsNs < 0 || metrics.holdTnsNs < 0 ? ['Hold timing failed'] : []),
    ...(metrics.drcViolations !== 0 ? ['Detailed-route DRC failed'] : []),
    ...(metrics.flowErrors !== 0 ? ['Flow reported errors'] : []),
  ];
  const score = objective === 'min_area' ? metrics.dieAreaUm2
    : objective === 'min_power' ? metrics.powerMw
    : metrics.dieAreaUm2 * metrics.powerMw / metrics.fmaxMHz;
  const artifacts = (job.resultManifest?.artifacts as Array<{ id: string; relativePath: string; sha256: string }> | undefined) ?? [];
  return { ...base, status: reasons.length ? 'rejected' : 'qualified', qualified: !reasons.length, reasons, metrics, score: reasons.length ? undefined : score, reportArtifacts: artifacts.filter((item) => expectedArtifacts.includes(item.relativePath)) };
}

export function markPareto(evaluations: CandidateEvaluation[]): CandidateEvaluation[] {
  const valid = evaluations.filter((item) => item.qualified && item.metrics);
  return evaluations.map((item) => {
    if (!item.qualified || !item.metrics) return item;
    const metrics = item.metrics;
    const dominated = valid.some((other) => {
      if (other.id === item.id || !other.metrics) return false;
      const theirs = other.metrics;
      return theirs.dieAreaUm2 <= metrics.dieAreaUm2 && theirs.powerMw <= metrics.powerMw && theirs.fmaxMHz >= metrics.fmaxMHz &&
        (theirs.dieAreaUm2 < metrics.dieAreaUm2 || theirs.powerMw < metrics.powerMw || theirs.fmaxMHz > metrics.fmaxMHz);
    });
    return { ...item, pareto: !dominated };
  });
}
