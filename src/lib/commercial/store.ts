import 'server-only';

import { createHash, randomUUID } from 'crypto';
import type { EdaIdentity } from '@/lib/eda/identity';
import { all, commercialDatabaseBackend, one, run } from './database';
import { objectStorageBackend, putWorkspaceObject } from './objectStore';
import type {
  AnalysisCorner,
  ConstraintSet,
  DecisionBrief,
  EcoChange,
  FeatureRecord,
  PpaSnapshot,
  RtlImpact,
  WorkspaceApproval,
  WorkspaceArtifact,
  WorkspaceBundle,
  WorkspaceProject,
} from './types';

type Row = Record<string, unknown>;

const now = () => new Date().toISOString();
const json = (value: unknown) => JSON.stringify(value);
const parse = <T>(value: unknown, fallback: T): T => {
  try { return typeof value === 'string' ? JSON.parse(value) as T : fallback; } catch { return fallback; }
};
const bool = (value: unknown) => value === true || value === 1 || value === '1';
const number = (value: unknown) => Number(value ?? 0);

function seededId(tenantId: string, name: string): string {
  const digest = createHash('sha256').update(`${tenantId}:${name}`).digest('hex');
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-a${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
}

function project(row: Row): WorkspaceProject {
  return {
    id: String(row.id), tenantId: String(row.tenant_id), name: String(row.name),
    description: String(row.description), repositoryUrl: String(row.repository_url),
    defaultBranch: String(row.default_branch), topModule: String(row.top_module),
    pdkRef: String(row.pdk_ref), status: String(row.status), createdBy: String(row.created_by),
    createdAt: String(row.created_at), updatedAt: String(row.updated_at),
  };
}

function constraint(row: Row): ConstraintSet {
  return { id: String(row.id), projectId: String(row.project_id), name: String(row.name), sdc: String(row.sdc), version: number(row.version), active: bool(row.active), createdAt: String(row.created_at) };
}

function corner(row: Row): AnalysisCorner {
  return { id: String(row.id), projectId: String(row.project_id), constraintSetId: String(row.constraint_set_id), name: String(row.name), process: String(row.process), voltage: number(row.voltage), temperature: number(row.temperature), libertyRef: String(row.liberty_ref), rcCorner: String(row.rc_corner), active: bool(row.active) };
}

function ppa(row: Row): PpaSnapshot {
  return {
    id: String(row.id), projectId: String(row.project_id), commitSha: String(row.commit_sha),
    branch: String(row.branch), message: String(row.message), author: String(row.author),
    areaUm2: number(row.area_um2), powerMw: number(row.power_mw), wnsNs: number(row.wns_ns),
    tnsNs: number(row.tns_ns), drcCount: number(row.drc_count), congestionPct: number(row.congestion_pct),
    deltas: parse(row.deltas_json, {}), thresholds: parse(row.thresholds_json, {}),
    evidence: parse(row.evidence_json, []), status: String(row.status) as PpaSnapshot['status'],
    createdAt: String(row.created_at),
  };
}

function impact(row: Row): RtlImpact {
  return {
    id: String(row.id), projectId: String(row.project_id), baseSha: String(row.base_sha),
    targetSha: String(row.target_sha), changedModules: parse(row.changed_modules_json, []),
    timingDeltaNs: number(row.timing_delta_ns), powerDeltaPct: number(row.power_delta_pct),
    congestionDeltaPct: number(row.congestion_delta_pct), drcDelta: number(row.drc_delta),
    affectedPaths: parse(row.affected_paths_json, []), evidence: parse(row.evidence_json, []),
    risk: String(row.risk) as RtlImpact['risk'], createdAt: String(row.created_at),
  };
}

function artifact(row: Row): WorkspaceArtifact {
  return {
    id: String(row.id), projectId: String(row.project_id), runRef: String(row.run_ref),
    kind: String(row.kind), name: String(row.name), objectKey: String(row.object_key),
    sha256: String(row.sha256), sizeBytes: number(row.size_bytes), metadata: parse(row.metadata_json, {}),
    createdAt: String(row.created_at),
  };
}

function approval(row: Row): WorkspaceApproval {
  return {
    id: String(row.id), projectId: String(row.project_id), targetType: String(row.target_type),
    targetId: String(row.target_id), status: String(row.status) as WorkspaceApproval['status'],
    rationale: String(row.rationale), requestedBy: String(row.requested_by),
    decidedBy: row.decided_by ? String(row.decided_by) : undefined,
    requestedAt: String(row.requested_at), decidedAt: row.decided_at ? String(row.decided_at) : undefined,
  };
}

function eco(row: Row): EcoChange {
  return {
    id: String(row.id), projectId: String(row.project_id), title: String(row.title),
    baselineSha: String(row.baseline_sha), targetSha: String(row.target_sha), objective: String(row.objective),
    patch: String(row.patch), status: String(row.status) as EcoChange['status'],
    beforeMetrics: parse(row.before_metrics_json, {}), afterMetrics: parse(row.after_metrics_json, {}),
    approvalId: row.approval_id ? String(row.approval_id) : undefined,
    createdAt: String(row.created_at), updatedAt: String(row.updated_at),
  };
}

function featureRecord(row: Row): FeatureRecord {
  return {
    id: String(row.id), projectId: String(row.project_id), feature: String(row.feature),
    recordType: String(row.record_type), title: String(row.title), status: String(row.status),
    payload: parse(row.payload_json, {}), evidence: parse(row.evidence_json, []), createdAt: String(row.created_at),
  };
}

function review(row: Row): DecisionBrief {
  const stored = parse<Partial<DecisionBrief>>(row.brief_json, {});
  const humanStatus = String(row.human_status) as DecisionBrief['humanStatus'];
  return {
    projectId: String(row.project_id), feature: String(row.feature),
    headline: stored.headline ?? 'Review unavailable',
    executiveSummary: stored.executiveSummary ?? 'The stored review could not be decoded.',
    risk: stored.risk ?? 'high', confidence: stored.confidence ?? 0,
    verdict: stored.verdict ?? 'insufficient-evidence',
    signoffPosition: stored.signoffPosition ?? 'Legacy review: repeat analysis with the current two-pass engineering review before making a signoff decision.',
    reviewMode: stored.reviewMode === 'single-pass' ? 'single-pass' : 'two-pass', promptVersion: stored.promptVersion ?? 'legacy',
    evidenceQuality: stored.evidenceQuality ?? { grade: 'D', score: 0, rationale: 'Legacy review has no structured evidence-quality assessment.' },
    findings: stored.findings ?? [],
    cornerCoverage: stored.cornerCoverage ?? { covered: [], missing: ['Structured corner assessment unavailable'], assessment: 'Repeat the review to evaluate PVT, RC and constraint coverage.' },
    metrics: stored.metrics ?? [], sections: stored.sections ?? [], tradeoffs: stored.tradeoffs ?? [],
    recommendedExperiments: stored.recommendedExperiments ?? [], stopConditions: stored.stopConditions ?? ['Do not use this legacy review for signoff.'],
    dataGaps: stored.dataGaps ?? [], actions: stored.actions ?? [], evidence: stored.evidence ?? [],
    assumptions: stored.assumptions ?? [], humanReviewGates: stored.humanReviewGates ?? [],
    provider: String(row.provider), model: String(row.model), humanStatus,
    humanDecision: stored.humanDecision, id: String(row.id), createdAt: String(row.created_at),
  };
}

async function ownsProject(identity: EdaIdentity, projectId: string): Promise<void> {
  const found = await one('SELECT id FROM commercial_projects WHERE tenant_id = ? AND id = ?', [identity.tenantId, projectId]);
  if (!found) throw new Error('Project was not found for this tenant');
}

async function audit(identity: EdaIdentity, action: string, resource: string, resourceId: string, details: unknown, requestId: string): Promise<void> {
  await run('INSERT INTO commercial_audit_events (id, tenant_id, actor_id, action, resource, resource_id, details_json, request_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [randomUUID(), identity.tenantId, identity.userId, action, resource, resourceId, json(details), requestId, now()]);
}

export async function seedWorkspace(identity: EdaIdentity): Promise<void> {
  if (process.env.NODE_ENV === 'production' && process.env.CHIP_ALLOW_COMMERCIAL_DEMO_SEED !== 'true') return;
  const existing = await one<{ n: string | number }>('SELECT COUNT(*) AS n FROM commercial_projects WHERE tenant_id = ?', [identity.tenantId]);
  if (number(existing?.n) > 0) return;
  const timestamp = now();
  const projectId = seededId(identity.tenantId, 'atlas-npu');
  await run('INSERT INTO commercial_projects (id, tenant_id, name, description, repository_url, default_branch, top_module, pdk_ref, status, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [
    projectId, identity.tenantId, 'Atlas NPU', 'Low-power neural accelerator reference program',
    'https://github.com/example/atlas-npu', 'main', 'atlas_npu_top', 'sky130A@1.0.0', 'active', identity.userId, timestamp, timestamp,
  ]);
  const constraintId = seededId(identity.tenantId, 'atlas-constraints');
  await run('INSERT INTO commercial_constraint_sets (id, tenant_id, project_id, name, sdc, version, active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [
    constraintId, identity.tenantId, projectId, 'Functional signoff', 'create_clock -name core_clk -period 2.000 [get_ports clk]\nset_input_delay 0.150 -clock core_clk [all_inputs]\nset_output_delay 0.150 -clock core_clk [all_outputs]', 3, 1, timestamp,
  ]);
  const corners = [
    ['ss_0p72v_125c', 'ss', 0.72, 125, 'sky130_ss.lib', 'rcworst'],
    ['tt_0p80v_25c', 'tt', 0.8, 25, 'sky130_tt.lib', 'rctyp'],
    ['ff_0p88v_m40c', 'ff', 0.88, -40, 'sky130_ff.lib', 'rcbest'],
  ];
  for (const [name, process, voltage, temperature, liberty, rc] of corners) {
    await run('INSERT INTO commercial_corners (id, tenant_id, project_id, constraint_set_id, name, process, voltage, temperature, liberty_ref, rc_corner, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [
      seededId(identity.tenantId, `corner-${name}`), identity.tenantId, projectId, constraintId, name, process, voltage, temperature, liberty, rc, 1,
    ]);
  }
  const snapshots = [
    ['a19d3e7', 'Baseline macro placement', 842100, 184.2, -0.042, -3.1, 4, 61.5],
    ['c31f7a2', 'Pipeline multiplier tree', 856400, 191.8, -0.081, -6.8, 7, 69.2],
    ['f40ab91', 'Recover timing with register balancing', 851200, 188.7, 0.013, 0, 2, 63.4],
  ];
  let previous: typeof snapshots[number] | undefined;
  for (const snapshot of snapshots) {
    const deltas = previous ? {
      areaPct: ((number(snapshot[2]) - number(previous[2])) / number(previous[2])) * 100,
      powerPct: ((number(snapshot[3]) - number(previous[3])) / number(previous[3])) * 100,
      wnsNs: number(snapshot[4]) - number(previous[4]),
      drc: number(snapshot[6]) - number(previous[6]),
      congestionPct: number(snapshot[7]) - number(previous[7]),
    } : {};
    await run('INSERT INTO commercial_ppa_snapshots (id, tenant_id, project_id, commit_sha, branch, message, author, area_um2, power_mw, wns_ns, tns_ns, drc_count, congestion_pct, deltas_json, thresholds_json, evidence_json, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [
      seededId(identity.tenantId, `ppa-${snapshot[0]}`), identity.tenantId, projectId, snapshot[0], 'main', snapshot[1], 'EDA Team', snapshot[2], snapshot[3], snapshot[4], snapshot[5], snapshot[6], snapshot[7], json(deltas), json({ areaPct: 3, powerPct: 5, wnsNs: -0.03, drc: 2, congestionPct: 5 }), json([`runs/${snapshot[0]}/metrics.json`, `runs/${snapshot[0]}/signoff/summary.rpt`]), previous && snapshot[0] === 'c31f7a2' ? 'regression' : previous ? 'pass' : 'baseline', timestamp,
    ]);
    previous = snapshot;
  }
  await run('INSERT INTO commercial_rtl_impacts (id, tenant_id, project_id, base_sha, target_sha, changed_modules_json, timing_delta_ns, power_delta_pct, congestion_delta_pct, drc_delta, affected_paths_json, evidence_json, risk, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [
    seededId(identity.tenantId, 'impact-c31f7a2'), identity.tenantId, projectId, 'a19d3e7', 'c31f7a2', json(['mac_array', 'multiplier_tree', 'accumulator']), -0.039, 4.13, 7.7, 3, json(['core_clk/mac_array/U42/Q → accumulator/U18/D', 'core_clk/multiplier/U7/Q → writeback/U2/D']), json(['git/diff/a19d3e7..c31f7a2', 'runs/c31f7a2/timing/max.rpt', 'runs/c31f7a2/congestion.rpt']), 'high', timestamp,
  ]);
  const ecoId = seededId(identity.tenantId, 'eco-register-balance');
  const approvalId = seededId(identity.tenantId, 'approval-register-balance');
  await run('INSERT INTO commercial_ecos (id, tenant_id, project_id, title, baseline_sha, target_sha, objective, patch, status, before_metrics_json, after_metrics_json, approval_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [
    ecoId, identity.tenantId, projectId, 'Register balance multiplier output', 'c31f7a2', 'f40ab91', 'Recover setup slack without exceeding the 5% power guardrail', '+ pipeline register after multiplier reduction tree\n~ retime accumulator enable path', 'approved', json({ wnsNs: -0.081, powerMw: 191.8, drc: 7 }), json({ wnsNs: 0.013, powerMw: 188.7, drc: 2 }), approvalId, timestamp, timestamp,
  ]);
  await run('INSERT INTO commercial_approvals (id, tenant_id, project_id, target_type, target_id, status, rationale, requested_by, decided_by, requested_at, decided_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [
    approvalId, identity.tenantId, projectId, 'eco', ecoId, 'approved', 'Timing recovered and signoff evidence meets configured guardrails.', identity.userId, identity.userId, timestamp, timestamp,
  ]);
  const featureSeeds = [
    ['spice-regression', 'regression-suite', 'Atlas SRAM PVT regression', 'attention', { simulator: 'ngspice', accelerator: 'GPU-8', passed: 142, failed: 3, corners: 12, worstDeltaPct: 7.4 }, ['spice/atlas-sram/run-204/report.json']],
    ['co-design', 'review-session', 'Floorplan review · Atlas NPU', 'active', { participants: 5, focus: 'SRAM channel congestion', cursors: 3, unresolvedComments: 2 }, ['sessions/floorplan-review-21/transcript.json']],
    ['library-marketplace', 'library-release', 'Atlas DSP Cells 2.3.1', 'verified', { pdk: 'sky130A', license: 'Apache-2.0', cells: 48, downloads: 327, checksumVerified: true }, ['libraries/atlas-dsp/2.3.1/manifest.json']],
  ];
  for (const [feature, recordType, title, status, payload, evidence] of featureSeeds) {
    await run('INSERT INTO commercial_feature_records (id, tenant_id, project_id, feature, record_type, title, status, payload_json, evidence_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [
      seededId(identity.tenantId, `feature-${feature}`), identity.tenantId, projectId, feature, recordType, title, status, json(payload), json(evidence), timestamp,
    ]);
  }
}

export async function workspaceBundle(identity: EdaIdentity): Promise<WorkspaceBundle> {
  await seedWorkspace(identity);
  const tenant = identity.tenantId;
  const [projects, constraints, corners, ppaSnapshots, rtlImpacts, artifacts, approvals, ecos, featureRecords, aiReviews] = await Promise.all([
    all('SELECT * FROM commercial_projects WHERE tenant_id = ? ORDER BY updated_at DESC', [tenant]),
    all('SELECT * FROM commercial_constraint_sets WHERE tenant_id = ? ORDER BY created_at DESC', [tenant]),
    all('SELECT * FROM commercial_corners WHERE tenant_id = ? ORDER BY name', [tenant]),
    all('SELECT * FROM commercial_ppa_snapshots WHERE tenant_id = ? ORDER BY created_at DESC, commit_sha DESC', [tenant]),
    all('SELECT * FROM commercial_rtl_impacts WHERE tenant_id = ? ORDER BY created_at DESC', [tenant]),
    all('SELECT * FROM commercial_artifacts WHERE tenant_id = ? ORDER BY created_at DESC', [tenant]),
    all('SELECT * FROM commercial_approvals WHERE tenant_id = ? ORDER BY requested_at DESC', [tenant]),
    all('SELECT * FROM commercial_ecos WHERE tenant_id = ? ORDER BY updated_at DESC', [tenant]),
    all('SELECT * FROM commercial_feature_records WHERE tenant_id = ? ORDER BY created_at DESC', [tenant]),
    all('SELECT * FROM commercial_ai_reviews WHERE tenant_id = ? ORDER BY created_at DESC', [tenant]),
  ]);
  return {
    projects: projects.map(project), constraints: constraints.map(constraint), corners: corners.map(corner),
    ppaSnapshots: ppaSnapshots.map(ppa), rtlImpacts: rtlImpacts.map(impact), artifacts: artifacts.map(artifact),
    approvals: approvals.map(approval), ecos: ecos.map(eco), featureRecords: featureRecords.map(featureRecord),
    aiReviews: aiReviews.map(review), storageBackend: objectStorageBackend, databaseBackend: commercialDatabaseBackend,
  };
}

export async function createWorkspaceProject(identity: EdaIdentity, input: Omit<WorkspaceProject, 'id' | 'tenantId' | 'createdBy' | 'createdAt' | 'updatedAt'>, requestId: string): Promise<WorkspaceProject> {
  const id = randomUUID(); const timestamp = now();
  await run('INSERT INTO commercial_projects (id, tenant_id, name, description, repository_url, default_branch, top_module, pdk_ref, status, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [id, identity.tenantId, input.name, input.description, input.repositoryUrl, input.defaultBranch, input.topModule, input.pdkRef, input.status, identity.userId, timestamp, timestamp]);
  await audit(identity, 'create', 'workspace_project', id, input, requestId);
  return project((await one('SELECT * FROM commercial_projects WHERE tenant_id = ? AND id = ?', [identity.tenantId, id]))!);
}

export async function createConstraint(identity: EdaIdentity, input: Omit<ConstraintSet, 'id' | 'version' | 'active' | 'createdAt'> & { active?: boolean }, requestId: string): Promise<ConstraintSet> {
  await ownsProject(identity, input.projectId);
  const versionRow = await one<{ n: string | number }>('SELECT COUNT(*) AS n FROM commercial_constraint_sets WHERE tenant_id = ? AND project_id = ? AND name = ?', [identity.tenantId, input.projectId, input.name]);
  const id = randomUUID();
  if (input.active !== false) await run('UPDATE commercial_constraint_sets SET active = 0 WHERE tenant_id = ? AND project_id = ?', [identity.tenantId, input.projectId]);
  await run('INSERT INTO commercial_constraint_sets (id, tenant_id, project_id, name, sdc, version, active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [id, identity.tenantId, input.projectId, input.name, input.sdc, number(versionRow?.n) + 1, input.active === false ? 0 : 1, now()]);
  await audit(identity, 'create', 'constraint_set', id, { projectId: input.projectId, name: input.name }, requestId);
  return constraint((await one('SELECT * FROM commercial_constraint_sets WHERE tenant_id = ? AND id = ?', [identity.tenantId, id]))!);
}

export async function createCorner(identity: EdaIdentity, input: Omit<AnalysisCorner, 'id' | 'active'> & { active?: boolean }, requestId: string): Promise<AnalysisCorner> {
  await ownsProject(identity, input.projectId); const id = randomUUID();
  const constraintRow = await one('SELECT id FROM commercial_constraint_sets WHERE tenant_id = ? AND project_id = ? AND id = ?', [identity.tenantId, input.projectId, input.constraintSetId]);
  if (!constraintRow) throw new Error('Constraint set was not found for this project');
  await run('INSERT INTO commercial_corners (id, tenant_id, project_id, constraint_set_id, name, process, voltage, temperature, liberty_ref, rc_corner, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [id, identity.tenantId, input.projectId, input.constraintSetId, input.name, input.process, input.voltage, input.temperature, input.libertyRef, input.rcCorner, input.active === false ? 0 : 1]);
  await audit(identity, 'create', 'analysis_corner', id, input, requestId);
  return corner((await one('SELECT * FROM commercial_corners WHERE tenant_id = ? AND id = ?', [identity.tenantId, id]))!);
}

export async function createPpaSnapshot(identity: EdaIdentity, input: Omit<PpaSnapshot, 'id' | 'deltas' | 'status' | 'createdAt'>, requestId: string): Promise<PpaSnapshot> {
  await ownsProject(identity, input.projectId);
  const existingRow = await one('SELECT * FROM commercial_ppa_snapshots WHERE tenant_id = ? AND project_id = ? AND commit_sha = ?', [identity.tenantId, input.projectId, input.commitSha]);
  const existing = existingRow ? ppa(existingRow) : undefined;
  const previousRow = await one('SELECT * FROM commercial_ppa_snapshots WHERE tenant_id = ? AND project_id = ? AND commit_sha <> ? ORDER BY created_at DESC LIMIT 1', [identity.tenantId, input.projectId, input.commitSha]);
  const previous = previousRow ? ppa(previousRow) : undefined;
  const deltas = previous ? {
    areaPct: ((input.areaUm2 - previous.areaUm2) / previous.areaUm2) * 100,
    powerPct: ((input.powerMw - previous.powerMw) / previous.powerMw) * 100,
    wnsNs: input.wnsNs - previous.wnsNs,
    tnsNs: input.tnsNs - previous.tnsNs,
    drc: input.drcCount - previous.drcCount,
    congestionPct: input.congestionPct - previous.congestionPct,
  } : {};
  const t = input.thresholds;
  const regression = previous && (
    number(deltas.areaPct) > number(t.areaPct) || number(deltas.powerPct) > number(t.powerPct) ||
    number(deltas.wnsNs) < number(t.wnsNs) || number(deltas.drc) > number(t.drc) ||
    number(deltas.congestionPct) > number(t.congestionPct)
  );
  const id = existing?.id ?? randomUUID();
  const timestamp = existing?.createdAt ?? now();
  const status = previous ? regression ? 'regression' : 'pass' : 'baseline';
  await run(`INSERT INTO commercial_ppa_snapshots
    (id, tenant_id, project_id, commit_sha, branch, message, author, area_um2, power_mw, wns_ns, tns_ns, drc_count, congestion_pct, deltas_json, thresholds_json, evidence_json, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (tenant_id, project_id, commit_sha) DO UPDATE SET
      branch = excluded.branch, message = excluded.message, author = excluded.author,
      area_um2 = excluded.area_um2, power_mw = excluded.power_mw,
      wns_ns = excluded.wns_ns, tns_ns = excluded.tns_ns,
      drc_count = excluded.drc_count, congestion_pct = excluded.congestion_pct,
      deltas_json = excluded.deltas_json, thresholds_json = excluded.thresholds_json,
      evidence_json = excluded.evidence_json, status = excluded.status`,
  [id, identity.tenantId, input.projectId, input.commitSha, input.branch, input.message, input.author, input.areaUm2, input.powerMw, input.wnsNs, input.tnsNs, input.drcCount, input.congestionPct, json(deltas), json(input.thresholds), json(input.evidence), status, timestamp]);
  await audit(identity, existing ? 'update' : 'create', 'ppa_snapshot', id, { projectId: input.projectId, commitSha: input.commitSha, deltas, idempotent: Boolean(existing) }, requestId);
  return ppa((await one('SELECT * FROM commercial_ppa_snapshots WHERE tenant_id = ? AND project_id = ? AND commit_sha = ?', [identity.tenantId, input.projectId, input.commitSha]))!);
}

export async function createRtlImpact(identity: EdaIdentity, input: Omit<RtlImpact, 'id' | 'risk' | 'createdAt'>, requestId: string): Promise<RtlImpact> {
  await ownsProject(identity, input.projectId);
  const score = (input.timingDeltaNs < -0.03 ? 3 : input.timingDeltaNs < 0 ? 1 : 0) + (input.powerDeltaPct > 5 ? 3 : input.powerDeltaPct > 2 ? 1 : 0) + (input.congestionDeltaPct > 5 ? 3 : input.congestionDeltaPct > 2 ? 1 : 0) + (input.drcDelta > 2 ? 3 : input.drcDelta > 0 ? 1 : 0);
  const risk: RtlImpact['risk'] = score >= 9 ? 'critical' : score >= 5 ? 'high' : score >= 2 ? 'moderate' : 'low';
  const id = randomUUID(); const timestamp = now();
  await run('INSERT INTO commercial_rtl_impacts (id, tenant_id, project_id, base_sha, target_sha, changed_modules_json, timing_delta_ns, power_delta_pct, congestion_delta_pct, drc_delta, affected_paths_json, evidence_json, risk, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [id, identity.tenantId, input.projectId, input.baseSha, input.targetSha, json(input.changedModules), input.timingDeltaNs, input.powerDeltaPct, input.congestionDeltaPct, input.drcDelta, json(input.affectedPaths), json(input.evidence), risk, timestamp]);
  await audit(identity, 'create', 'rtl_impact', id, { projectId: input.projectId, baseSha: input.baseSha, targetSha: input.targetSha, risk }, requestId);
  return impact((await one('SELECT * FROM commercial_rtl_impacts WHERE tenant_id = ? AND id = ?', [identity.tenantId, id]))!);
}

export async function createArtifact(identity: EdaIdentity, input: { projectId: string; runRef: string; kind: string; name: string; content: string; metadata: Record<string, unknown> }, requestId: string): Promise<WorkspaceArtifact> {
  await ownsProject(identity, input.projectId); const id = randomUUID();
  const body = Buffer.from(input.content, 'utf8');
  const stored = await putWorkspaceObject({ tenantId: identity.tenantId, projectId: input.projectId, artifactId: id, name: input.name, body });
  await run('INSERT INTO commercial_artifacts (id, tenant_id, project_id, run_ref, kind, name, object_key, sha256, size_bytes, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [id, identity.tenantId, input.projectId, input.runRef, input.kind, input.name, stored.key, stored.sha256, stored.sizeBytes, json(input.metadata), now()]);
  await audit(identity, 'create', 'workspace_artifact', id, { projectId: input.projectId, key: stored.key, sha256: stored.sha256 }, requestId);
  return artifact((await one('SELECT * FROM commercial_artifacts WHERE tenant_id = ? AND id = ?', [identity.tenantId, id]))!);
}

export async function createApproval(identity: EdaIdentity, input: { projectId: string; targetType: string; targetId: string; rationale: string }, requestId: string): Promise<WorkspaceApproval> {
  await ownsProject(identity, input.projectId); const id = randomUUID();
  await run('INSERT INTO commercial_approvals (id, tenant_id, project_id, target_type, target_id, status, rationale, requested_by, requested_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [id, identity.tenantId, input.projectId, input.targetType, input.targetId, 'pending', input.rationale, identity.userId, now()]);
  await audit(identity, 'request', 'approval', id, input, requestId);
  return approval((await one('SELECT * FROM commercial_approvals WHERE tenant_id = ? AND id = ?', [identity.tenantId, id]))!);
}

export async function decideApproval(identity: EdaIdentity, id: string, decision: 'approved' | 'rejected', rationale: string, requestId: string): Promise<WorkspaceApproval> {
  const existing = await one('SELECT * FROM commercial_approvals WHERE tenant_id = ? AND id = ?', [identity.tenantId, id]);
  if (!existing) throw new Error('Approval was not found for this tenant');
  if (String(existing.requested_by) === identity.userId) throw new Error('Independent reviewer is required');
  if (String(existing.status) !== 'pending') throw new Error('Approval was already decided');
  await run('UPDATE commercial_approvals SET status = ?, rationale = ?, decided_by = ?, decided_at = ? WHERE tenant_id = ? AND id = ?', [decision, rationale, identity.userId, now(), identity.tenantId, id]);
  await audit(identity, decision, 'approval', id, { rationale }, requestId);
  return approval((await one('SELECT * FROM commercial_approvals WHERE tenant_id = ? AND id = ?', [identity.tenantId, id]))!);
}

export async function createEco(identity: EdaIdentity, input: Omit<EcoChange, 'id' | 'status' | 'approvalId' | 'createdAt' | 'updatedAt'>, requestId: string): Promise<EcoChange> {
  await ownsProject(identity, input.projectId); const id = randomUUID(); const timestamp = now();
  await run('INSERT INTO commercial_ecos (id, tenant_id, project_id, title, baseline_sha, target_sha, objective, patch, status, before_metrics_json, after_metrics_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [id, identity.tenantId, input.projectId, input.title, input.baselineSha, input.targetSha, input.objective, input.patch, 'draft', json(input.beforeMetrics), json(input.afterMetrics), timestamp, timestamp]);
  await audit(identity, 'create', 'eco', id, { projectId: input.projectId, title: input.title }, requestId);
  return eco((await one('SELECT * FROM commercial_ecos WHERE tenant_id = ? AND id = ?', [identity.tenantId, id]))!);
}

export async function createFeatureRecord(identity: EdaIdentity, input: Omit<FeatureRecord, 'id' | 'createdAt'>, requestId: string): Promise<FeatureRecord> {
  await ownsProject(identity, input.projectId); const id = randomUUID();
  await run('INSERT INTO commercial_feature_records (id, tenant_id, project_id, feature, record_type, title, status, payload_json, evidence_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [id, identity.tenantId, input.projectId, input.feature, input.recordType, input.title, input.status, json(input.payload), json(input.evidence), now()]);
  await audit(identity, 'create', 'feature_record', id, { projectId: input.projectId, feature: input.feature }, requestId);
  return featureRecord((await one('SELECT * FROM commercial_feature_records WHERE tenant_id = ? AND id = ?', [identity.tenantId, id]))!);
}

export async function saveDecisionBrief(identity: EdaIdentity, brief: Omit<DecisionBrief, 'id' | 'createdAt'>, requestId: string): Promise<DecisionBrief> {
  await ownsProject(identity, brief.projectId); const id = randomUUID(); const timestamp = now();
  await run('INSERT INTO commercial_ai_reviews (id, tenant_id, project_id, feature, brief_json, provider, model, human_status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [id, identity.tenantId, brief.projectId, brief.feature, json(brief), brief.provider, brief.model, brief.humanStatus, timestamp]);
  await audit(identity, 'create', 'ai_review', id, { projectId: brief.projectId, feature: brief.feature, risk: brief.risk }, requestId);
  return { ...brief, id, createdAt: timestamp };
}

export async function projectReviewContext(identity: EdaIdentity, projectId: string, feature: string): Promise<Record<string, unknown>> {
  await ownsProject(identity, projectId);
  const [projectRow, constraintRows, cornerRows, ppaRows, impactRows, artifactRows, ecoRows, approvalRows, featureRows] = await Promise.all([
    one('SELECT * FROM commercial_projects WHERE tenant_id = ? AND id = ?', [identity.tenantId, projectId]),
    all('SELECT * FROM commercial_constraint_sets WHERE tenant_id = ? AND project_id = ? ORDER BY active DESC, version DESC LIMIT 5', [identity.tenantId, projectId]),
    all('SELECT * FROM commercial_corners WHERE tenant_id = ? AND project_id = ? AND active = 1 ORDER BY name', [identity.tenantId, projectId]),
    all('SELECT * FROM commercial_ppa_snapshots WHERE tenant_id = ? AND project_id = ? ORDER BY created_at DESC LIMIT 12', [identity.tenantId, projectId]),
    all('SELECT * FROM commercial_rtl_impacts WHERE tenant_id = ? AND project_id = ? ORDER BY created_at DESC LIMIT 8', [identity.tenantId, projectId]),
    all('SELECT * FROM commercial_artifacts WHERE tenant_id = ? AND project_id = ? ORDER BY created_at DESC LIMIT 30', [identity.tenantId, projectId]),
    all('SELECT * FROM commercial_ecos WHERE tenant_id = ? AND project_id = ? ORDER BY updated_at DESC LIMIT 10', [identity.tenantId, projectId]),
    all('SELECT * FROM commercial_approvals WHERE tenant_id = ? AND project_id = ? ORDER BY requested_at DESC LIMIT 10', [identity.tenantId, projectId]),
    all('SELECT * FROM commercial_feature_records WHERE tenant_id = ? AND project_id = ? AND feature = ? ORDER BY created_at DESC LIMIT 10', [identity.tenantId, projectId, feature]),
  ]);
  if (!projectRow) throw new Error('Project was not found for this tenant');
  return {
    project: project(projectRow),
    constraintVersions: constraintRows.map(constraint),
    activeCorners: cornerRows.map(corner),
    ppaHistory: ppaRows.map(ppa),
    rtlImpactHistory: impactRows.map(impact),
    artifacts: artifactRows.map(artifact).map(item => ({ id: item.id, runRef: item.runRef, kind: item.kind, name: item.name, sha256: item.sha256, sizeBytes: item.sizeBytes, metadata: item.metadata, createdAt: item.createdAt })),
    ecos: ecoRows.map(eco),
    approvals: approvalRows.map(approval),
    featureHistory: featureRows.map(featureRecord),
  };
}

export async function decideAiReview(identity: EdaIdentity, id: string, status: 'accepted' | 'rejected', rationale: string, requestId: string): Promise<DecisionBrief> {
  const row = await one('SELECT * FROM commercial_ai_reviews WHERE tenant_id = ? AND id = ?', [identity.tenantId, id]);
  if (!row) throw new Error('AI review was not found for this tenant');
  const current = review(row);
  const decidedAt = now();
  const updated: DecisionBrief = { ...current, humanStatus: status, humanDecision: { rationale, decidedBy: identity.userId, decidedAt } };
  await run('UPDATE commercial_ai_reviews SET brief_json = ?, human_status = ? WHERE tenant_id = ? AND id = ?', [json(updated), status, identity.tenantId, id]);
  await audit(identity, 'decide', 'ai_review', id, { projectId: current.projectId, status, rationale }, requestId);
  return updated;
}

export async function artifactForTenant(identity: EdaIdentity, id: string): Promise<WorkspaceArtifact | undefined> {
  const row = await one('SELECT * FROM commercial_artifacts WHERE tenant_id = ? AND id = ?', [identity.tenantId, id]);
  return row ? artifact(row) : undefined;
}
