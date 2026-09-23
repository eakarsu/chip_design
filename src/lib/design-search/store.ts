import 'server-only';

import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { all, commercialTransaction, lockCommercialProject, one, run } from '@/lib/commercial/database';
import type { EdaIdentity } from '@/lib/eda/identity';
import { createJob, createProject, getJob, jobWorkspace, listProjects, pinnedImage } from '@/lib/eda/store';
import { ORFS_IMAGE_DIGEST, SKY130_REFERENCE_PROJECT } from '@/lib/eda/referenceCase';
import { getRevision, journeyBundle, saveRevision } from '@/lib/journey/store';
import { digest, expectedChecks, reportPassed, revisionDigest, verificationInputs, verificationReportSchema } from '@/lib/journey/verification';
import type { DesignRevision, VerificationKind } from '@/lib/journey/types';
import { buildOrfsConfig } from '@/lib/operations/domain';
import { proposeExperiments, proposeRtlExperiments } from './agent';
import { evaluateCandidate, markPareto, type CandidateEvaluation, type SearchCandidate, type SearchObjective } from './evaluation';
import { discoverLiterature, type LiteratureSource, type SearchTopic } from './literature';
import { equivalenceInputs } from './equivalence';

export interface SearchCampaign {
  id: string;
  projectId: string;
  revisionId: string;
  sourceHash: string;
  toolImage: string;
  pdkDigest: string;
  objective: SearchObjective;
  topic: SearchTopic;
  maxCandidates: number;
  maxCpuSeconds: number;
  jobCpuSeconds: number;
  literature: LiteratureSource[];
  selectedCandidateId?: string;
  selectedBy?: string;
  selectedAt?: string;
  selectionRationale?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

type Row = Record<string, unknown>;

function campaignFromRow(row: Row): SearchCampaign {
  return {
    id: String(row.id), projectId: String(row.project_id), revisionId: String(row.revision_id),
    sourceHash: String(row.source_hash), toolImage: String(row.tool_image), pdkDigest: String(row.pdk_digest),
    objective: row.objective as SearchObjective,
    topic: row.topic as SearchTopic, maxCandidates: Number(row.max_candidates),
    maxCpuSeconds: Number(row.max_cpu_seconds), jobCpuSeconds: Number(row.job_cpu_seconds),
    literature: JSON.parse(String(row.literature_json)) as LiteratureSource[],
    selectedCandidateId: row.selected_candidate_id ? String(row.selected_candidate_id) : undefined,
    selectedBy: row.selected_by ? String(row.selected_by) : undefined,
    selectedAt: row.selected_at ? String(row.selected_at) : undefined,
    selectionRationale: row.selection_rationale ? String(row.selection_rationale) : undefined,
    createdBy: String(row.created_by), createdAt: String(row.created_at), updatedAt: String(row.updated_at),
  };
}

function candidateFromRow(row: Row): SearchCandidate {
  return {
    id: String(row.id), campaignId: String(row.campaign_id), iteration: Number(row.iteration),
    kind: Number(row.iteration) === 0 ? 'baseline' : 'placement',
    title: String(row.title), hypothesis: String(row.hypothesis),
    sourceIds: JSON.parse(String(row.source_ids_json)) as string[],
    coreUtilization: Number(row.core_utilization), placeDensity: Number(row.place_density),
    proposedBy: String(row.proposed_by), jobId: row.job_id ? String(row.job_id) : undefined,
    createdAt: String(row.created_at),
  };
}

function rtlCandidateFromRow(row: Row): SearchCandidate {
  return {
    id: String(row.id), campaignId: String(row.campaign_id), iteration: Number(row.iteration), kind: 'rtl',
    title: String(row.title), hypothesis: String(row.hypothesis),
    sourceIds: JSON.parse(String(row.source_ids_json)) as string[],
    coreUtilization: Number(row.core_utilization), placeDensity: Number(row.place_density),
    proposedBy: String(row.proposed_by), rtl: String(row.rtl), rtlSourceHash: String(row.source_hash),
    simulationJobId: row.simulation_job_id ? String(row.simulation_job_id) : undefined,
    formalJobId: row.formal_job_id ? String(row.formal_job_id) : undefined,
    jobId: row.job_id ? String(row.job_id) : undefined, createdAt: String(row.created_at),
  };
}

async function audit(identity: EdaIdentity, action: string, resourceId: string, details: unknown, requestId: string): Promise<void> {
  await run('INSERT INTO commercial_audit_events (id,tenant_id,actor_id,action,resource,resource_id,details_json,request_id,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
    [randomUUID(), identity.tenantId, identity.userId, action, 'design_search', resourceId, JSON.stringify(details), requestId, new Date().toISOString()]);
}

export async function listSearchCampaigns(identity: EdaIdentity, projectId?: string): Promise<SearchCampaign[]> {
  const rows = projectId
    ? await all('SELECT * FROM design_search_campaigns WHERE tenant_id=? AND project_id=? ORDER BY created_at DESC LIMIT 100', [identity.tenantId, projectId])
    : await all('SELECT * FROM design_search_campaigns WHERE tenant_id=? ORDER BY created_at DESC LIMIT 100', [identity.tenantId]);
  return rows.map(campaignFromRow);
}

export async function getSearchCampaign(identity: EdaIdentity, campaignId: string): Promise<SearchCampaign> {
  const row = await one('SELECT * FROM design_search_campaigns WHERE tenant_id=? AND id=?', [identity.tenantId, campaignId]);
  if (!row) throw new Error('Design search campaign not found');
  return campaignFromRow(row);
}

async function candidatesFor(identity: EdaIdentity, campaignId: string): Promise<SearchCandidate[]> {
  const rows = await all('SELECT * FROM design_search_candidates WHERE tenant_id=? AND campaign_id=? ORDER BY created_at,id', [identity.tenantId, campaignId]);
  const rtlRows = await all('SELECT * FROM design_search_rtl_candidates WHERE tenant_id=? AND campaign_id=? ORDER BY created_at,id', [identity.tenantId, campaignId]);
  const proofRows = await all('SELECT candidate_id,job_id FROM design_search_proofs WHERE tenant_id=? AND campaign_id=?', [identity.tenantId, campaignId]);
  const proofs = new Map(proofRows.map((row) => [String(row.candidate_id), String(row.job_id)]));
  return [...rows.map(candidateFromRow), ...rtlRows.map(rtlCandidateFromRow)]
    .map((candidate) => ({ ...candidate, proofJobId: proofs.get(candidate.id) }))
    .sort((left, right) => left.iteration - right.iteration || left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id));
}

const RTL_TEST_SEED = 73001;
const verificationPurpose = (revision: DesignRevision): 'lab' | 'regression' =>
  revision.templateId === 'custom' ? 'regression' : 'lab';

function candidateRevision(base: DesignRevision, candidate: SearchCandidate): DesignRevision {
  if (candidate.kind !== 'rtl' || !candidate.rtl) return base;
  const revised = { ...base, rtl: candidate.rtl, id: candidate.id };
  const sourceHash = revisionDigest(revised);
  if (candidate.rtlSourceHash !== sourceHash) throw new Error('Candidate RTL source checksum mismatch');
  return { ...revised, sourceHash };
}

function verificationResult(identity: EdaIdentity, candidate: SearchCandidate, revision: DesignRevision,
  kind: VerificationKind | 'equivalence', pdkDigest: string, gold?: DesignRevision): { passed: boolean; status: string } {
  const jobId = kind === 'simulation' ? candidate.simulationJobId : kind === 'formal' ? candidate.formalJobId : candidate.proofJobId;
  if (!jobId) return { passed: false, status: 'not queued' };
  const job = getJob(identity, jobId);
  if (!job || job.kind !== (kind === 'equivalence' ? 'formal' : kind) || job.projectId !== revision.projectId || job.pdkDigest !== pdkDigest || job.artifactsExpiredAt)
    return { passed: false, status: 'invalid evidence' };
  if (job.status !== 'succeeded') return { passed: false, status: job.status };
  try {
    const expected = kind === 'equivalence'
      ? equivalenceInputs(gold!, revision)
      : verificationInputs(revision, kind, verificationPurpose(revision), RTL_TEST_SEED);
    const files = job.inputManifest.files as Array<{ name: string; sha256: string; size: number }> | undefined;
    const entries = Object.entries(expected.inputs);
    if (!files || files.length !== entries.length || entries.some(([name, content]) =>
      !files.some((file) => file.name === name && file.sha256 === digest(content) && file.size === Buffer.byteLength(content))))
      return { passed: false, status: 'input mismatch' };
    if (job.resultManifest?.requestHash !== job.requestHash || job.resultManifest?.toolImage !== job.toolImage ||
        job.resultManifest?.pdkDigest !== job.pdkDigest)
      return { passed: false, status: 'provenance mismatch' };
    const artifact = (job.resultManifest?.artifacts as Array<{ relativePath: string; sha256: string; size: number }> | undefined)
      ?.find((item) => item.relativePath === 'verification-report.json');
    if (!artifact || artifact.size > 2_000_000) return { passed: false, status: 'report missing' };
    const filename = path.join(jobWorkspace(job), 'output', 'verification-report.json');
    const stat = fs.lstatSync(filename);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== artifact.size)
      return { passed: false, status: 'report invalid' };
    const bytes = fs.readFileSync(filename);
    if (digest(bytes) !== artifact.sha256) return { passed: false, status: 'checksum mismatch' };
    const report = verificationReportSchema.parse(JSON.parse(bytes.toString('utf8')));
    const passed = report.kind === (kind === 'equivalence' ? 'formal' : kind) &&
      report.sourceHash === revision.sourceHash && report.suiteHash === expected.suiteHash &&
      reportPassed(report, kind === 'equivalence' ? ['equivalence'] :
        revision.templateId === 'custom' ? [] : expectedChecks(revision.templateId, kind));
    return { passed, status: passed ? 'passed' : 'failed' };
  } catch {
    return { passed: false, status: 'invalid evidence' };
  }
}

export async function createSearchCampaign(identity: EdaIdentity, input: {
  projectId: string; revisionId: string; objective: SearchObjective; topic: SearchTopic;
  maxCandidates: number; maxCpuSeconds: number; jobCpuSeconds: number;
}, requestId: string): Promise<SearchCampaign> {
  if (identity.role === 'viewer') throw new Error('Editor role required');
  const revision = await getRevision(identity, input.projectId, input.revisionId);
  if (!revision) throw new Error('Saved design revision not found');
  if (input.topic !== 'placement' && revision.rtl.length > 16_000)
    throw new Error('RTL source exceeds the bounded agent context');
  const toolImage = pinnedImage('openroad');
  const executionProject = listProjects(identity).find((item) => item.id === input.projectId);
  if (executionProject && !/sky130/i.test(executionProject.pdkRef))
    throw new Error('This first Design Search flow requires a SKY130 execution project');
  const pdkDigest = executionProject?.pdkDigest || process.env.CHIP_JOURNEY_PDK_DIGEST ||
    toolImage.split('@sha256:')[1] || ORFS_IMAGE_DIGEST;
  if (input.maxCandidates < 2 || input.maxCandidates > 12 || input.jobCpuSeconds < 120 || input.jobCpuSeconds > 3600 ||
      input.maxCpuSeconds < input.jobCpuSeconds || input.maxCpuSeconds > 43_200)
    throw new Error('Invalid candidate or CPU budget');
  const id = randomUUID();
  const baselineId = randomUUID();
  const timestamp = new Date().toISOString();
  await commercialTransaction(async () => {
    await lockCommercialProject(identity.tenantId, input.projectId);
    await run('INSERT INTO design_search_campaigns (id,tenant_id,project_id,revision_id,source_hash,tool_image,pdk_digest,objective,topic,max_candidates,max_cpu_seconds,job_cpu_seconds,literature_json,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      [id, identity.tenantId, input.projectId, revision.id, revision.sourceHash, toolImage, pdkDigest, input.objective, input.topic,
        input.maxCandidates, input.maxCpuSeconds, input.jobCpuSeconds, '[]', identity.userId, timestamp, timestamp]);
    await run('INSERT INTO design_search_candidates (id,tenant_id,campaign_id,project_id,iteration,title,hypothesis,source_ids_json,core_utilization,place_density,proposed_by,job_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
      [baselineId, identity.tenantId, id, input.projectId, 0, 'Locked baseline',
        'Run the unchanged source and constraints at the current default settings to establish a comparable measured control.',
        '[]', 38, 0.55, 'system', null, timestamp]);
    await audit(identity, 'design-search.created', id, { revisionId: revision.id, sourceHash: revision.sourceHash, baselineId }, requestId);
  });
  return getSearchCampaign(identity, id);
}

export async function searchCampaignDetails(identity: EdaIdentity, campaignId: string): Promise<{
  campaign: SearchCampaign;
  candidates: CandidateEvaluation[];
  verification: { simulationPassed: boolean; formalPassed: boolean };
  bestCandidateId?: string;
  usedCpuSeconds: number;
  actorRole: EdaIdentity['role'];
}> {
  const campaign = await getSearchCampaign(identity, campaignId);
  const revision = await getRevision(identity, campaign.projectId, campaign.revisionId);
  if (!revision || revision.sourceHash !== campaign.sourceHash) throw new Error('Locked revision provenance mismatch');
  const candidates = await candidatesFor(identity, campaign.id);
  const bundle = await journeyBundle(identity, campaign.projectId);
  const matching = bundle.runs.filter((item) => item.revisionId === campaign.revisionId &&
    item.purpose === verificationPurpose(revision));
  const verification = {
    simulationPassed: matching.some((item) => item.kind === 'simulation' && item.report && reportPassed(item.report)),
    formalPassed: matching.some((item) => item.kind === 'formal' && item.report && reportPassed(item.report)),
  };
  const evaluations = markPareto(candidates.map((candidate) => {
    let testedRevision: DesignRevision;
    try { testedRevision = candidateRevision(revision, candidate); }
    catch { return { ...candidate, status: 'rejected', qualified: false, reasons: ['Candidate RTL source checksum mismatch'], pareto: false }; }
    const simulation = candidate.kind === 'rtl'
      ? verificationResult(identity, candidate, testedRevision, 'simulation', campaign.pdkDigest)
      : { passed: verification.simulationPassed, status: verification.simulationPassed ? 'passed' : 'needed' };
    const formal = candidate.kind === 'rtl'
      ? verificationResult(identity, candidate, testedRevision, 'formal', campaign.pdkDigest)
      : { passed: verification.formalPassed, status: verification.formalPassed ? 'passed' : 'needed' };
    const proof = candidate.kind === 'rtl'
      ? verificationResult(identity, candidate, testedRevision, 'equivalence', campaign.pdkDigest, revision)
      : { passed: true, status: 'not applicable' };
    const evaluation = evaluateCandidate(candidate, candidate.jobId ? getJob(identity, candidate.jobId) : undefined,
      testedRevision, campaign.objective, { toolImage: campaign.toolImage, pdkDigest: campaign.pdkDigest });
    const withVerification = { ...evaluation, verification: {
      simulationPassed: simulation.passed, formalPassed: formal.passed,
      proofPassed: proof.passed, simulationStatus: simulation.status, formalStatus: formal.status,
      proofStatus: proof.status,
    } };
    if (evaluation.qualified && (!verification.simulationPassed || !verification.formalPassed ||
        !simulation.passed || !formal.passed || !proof.passed)) {
      return { ...withVerification, status: 'rejected', qualified: false, score: undefined,
        reasons: ['Simulation, safety, or equivalence evidence no longer verifies'] };
    }
    return withVerification;
  }));
  const usedCpuSeconds = candidates.reduce((sum, item) => sum + (item.jobId ? getJob(identity, item.jobId)?.expectedCpuSeconds ?? 0 : 0), 0);
  const best = [...evaluations].filter((item) => item.qualified && item.score !== undefined).sort((a, b) => a.score! - b.score!)[0];
  return { campaign, candidates: evaluations, verification, bestCandidateId: best?.id, usedCpuSeconds,
    actorRole: identity.role };
}

export async function researchCampaign(identity: EdaIdentity, campaignId: string, requestId: string): Promise<SearchCampaign> {
  if (identity.role === 'viewer') throw new Error('Editor role required');
  const campaign = await getSearchCampaign(identity, campaignId);
  const discovered = await discoverLiterature(campaign.topic);
  const literature = [...campaign.literature];
  const known = new Set(literature.map((item) => item.id));
  for (const source of discovered) if (!known.has(source.id)) { literature.push(source); known.add(source.id); }
  await commercialTransaction(async () => {
    await lockCommercialProject(identity.tenantId, campaign.projectId);
    await run('UPDATE design_search_campaigns SET literature_json=?,updated_at=? WHERE tenant_id=? AND id=?',
      [JSON.stringify(literature), new Date().toISOString(), identity.tenantId, campaign.id]);
    await audit(identity, 'design-search.literature-discovered', campaign.id, { sourceIds: literature.map((item) => item.id) }, requestId);
  });
  return getSearchCampaign(identity, campaign.id);
}

export async function generateSearchCandidates(identity: EdaIdentity, campaignId: string, requestId: string): Promise<ReturnType<typeof searchCampaignDetails>> {
  if (identity.role === 'viewer') throw new Error('Editor role required');
  let details = await searchCampaignDetails(identity, campaignId);
  if (!details.candidates.find((item) => item.iteration === 0)?.qualified)
    throw new Error('Run and qualify the locked baseline before requesting agent proposals');
  if (!details.campaign.literature.length) {
    await researchCampaign(identity, campaignId, requestId);
    details = await searchCampaignDetails(identity, campaignId);
  }
  const available = details.campaign.maxCandidates - details.candidates.length;
  if (available < 1) throw new Error('Campaign candidate limit reached');
  const revision = await getRevision(identity, details.campaign.projectId, details.campaign.revisionId);
  if (!revision) throw new Error('Locked revision not found');
  if (details.campaign.topic !== 'placement') {
    const generated = await proposeRtlExperiments({ revision, objective: details.campaign.objective,
      literature: details.campaign.literature, previous: details.candidates, count: Math.min(2, available) });
    const valid = generated.proposals.flatMap((proposal) => {
      const rtl = proposal.rtl.trim();
      if (/\b(?:initial|final|force|release|specify|specparam|primitive|endprimitive)\b|\$/.test(rtl)) return [];
      const revised = { ...revision, rtl };
      revised.sourceHash = revisionDigest(revised);
      if (revised.sourceHash === revision.sourceHash) return [];
      try {
        verificationInputs(revised, 'simulation', verificationPurpose(revised), RTL_TEST_SEED);
        verificationInputs(revised, 'formal', verificationPurpose(revised), RTL_TEST_SEED);
      } catch { return []; }
      return [{ ...proposal, rtl, sourceHash: revised.sourceHash }];
    });
    if (!valid.length) throw new Error('AI produced no policy-admissible, distinct RTL candidates');
    await commercialTransaction(async () => {
      await lockCommercialProject(identity.tenantId, details.campaign.projectId);
      const current = await candidatesFor(identity, campaignId);
      let remaining = details.campaign.maxCandidates - current.length;
      const existing = new Set([revision.sourceHash, ...current.map((item) => item.rtlSourceHash).filter(Boolean)]);
      const iteration = Math.max(...current.map((item) => item.iteration)) + 1;
      for (const proposal of valid) {
        if (!remaining || existing.has(proposal.sourceHash)) continue;
        existing.add(proposal.sourceHash); remaining--;
        await run('INSERT INTO design_search_rtl_candidates (id,tenant_id,campaign_id,project_id,iteration,title,hypothesis,source_ids_json,rtl,source_hash,core_utilization,place_density,proposed_by,simulation_job_id,formal_job_id,job_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
          [randomUUID(), identity.tenantId, campaignId, details.campaign.projectId, iteration, proposal.title,
            proposal.hypothesis, JSON.stringify(proposal.sourceIds), proposal.rtl, proposal.sourceHash,
            38, 0.55, `agent:${generated.model}`, null, null, null, new Date().toISOString()]);
      }
      await audit(identity, 'design-search.rtl-candidates-proposed', campaignId,
        { model: generated.model, iteration, sourceHashes: valid.map((item) => item.sourceHash) }, requestId);
    });
    return searchCampaignDetails(identity, campaignId);
  }
  const generated = await proposeExperiments({ revision, objective: details.campaign.objective,
    literature: details.campaign.literature, previous: details.candidates, count: Math.min(3, available) });
  await commercialTransaction(async () => {
    await lockCommercialProject(identity.tenantId, details.campaign.projectId);
    const current = await candidatesFor(identity, campaignId);
    let remaining = details.campaign.maxCandidates - current.length;
    const existing = new Set(current.map((item) => `${item.coreUtilization}:${item.placeDensity}`));
    const iteration = Math.max(...current.map((item) => item.iteration)) + 1;
    for (const proposal of generated.proposals) {
      const key = `${proposal.coreUtilization}:${proposal.placeDensity}`;
      if (!remaining || existing.has(key)) continue;
      existing.add(key); remaining--;
      await run('INSERT INTO design_search_candidates (id,tenant_id,campaign_id,project_id,iteration,title,hypothesis,source_ids_json,core_utilization,place_density,proposed_by,job_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
        [randomUUID(), identity.tenantId, campaignId, details.campaign.projectId, iteration, proposal.title,
          proposal.hypothesis, JSON.stringify(proposal.sourceIds), proposal.coreUtilization, proposal.placeDensity,
          `agent:${generated.model}`, null, new Date().toISOString()]);
    }
    await audit(identity, 'design-search.candidates-proposed', campaignId, { model: generated.model, iteration }, requestId);
  });
  return searchCampaignDetails(identity, campaignId);
}

function ensureExecutionProject(identity: EdaIdentity, projectId: string, pdkDigest: string): void {
  const existing = listProjects(identity).find((item) => item.id === projectId);
  if (existing) {
    if (!/sky130/i.test(existing.pdkRef) || existing.pdkDigest !== pdkDigest)
      throw new Error('Execution project PDK does not match the locked SKY130 campaign');
    return;
  }
  try { createProject(identity, { ...SKY130_REFERENCE_PROJECT, id: projectId, name: `Workspace ${projectId}`, pdkDigest }); }
  catch (error) {
    if (!listProjects(identity).some((item) => item.id === projectId)) throw error;
  }
}

export async function dispatchRtlVerification(identity: EdaIdentity, campaignId: string, candidateId: string,
  requestId: string): Promise<ReturnType<typeof searchCampaignDetails>> {
  if (identity.role === 'viewer') throw new Error('Editor role required');
  const details = await searchCampaignDetails(identity, campaignId);
  if (!details.candidates.find((item) => item.kind === 'baseline')?.qualified)
    throw new Error('The locked baseline must qualify before candidate verification runs');
  const campaign = await getSearchCampaign(identity, campaignId);
  if (campaign.topic === 'placement') throw new Error('RTL verification is only available for RTL campaigns');
  const base = await getRevision(identity, campaign.projectId, campaign.revisionId);
  if (!base || base.sourceHash !== campaign.sourceHash) throw new Error('Locked revision provenance mismatch');
  await commercialTransaction(async () => {
    await lockCommercialProject(identity.tenantId, campaign.projectId);
    const candidate = (await candidatesFor(identity, campaignId)).find((item) => item.id === candidateId);
    if (!candidate || candidate.kind !== 'rtl') throw new Error('RTL candidate not found');
    const revised = candidateRevision(base, candidate);
    ensureExecutionProject(identity, campaign.projectId, campaign.pdkDigest);
    for (const kind of ['simulation', 'formal'] as const) {
      if (kind === 'simulation' ? candidate.simulationJobId : candidate.formalJobId) continue;
      const { inputs } = verificationInputs(revised, kind, verificationPurpose(revised), RTL_TEST_SEED);
      const job = createJob(identity, { projectId: campaign.projectId, kind,
        idempotencyKey: `design-search:${candidate.id}:${kind}`, inputs,
        expectedCpuSeconds: kind === 'simulation' ? 180 : 300, retentionDays: 90 });
      const column = kind === 'simulation' ? 'simulation_job_id' : 'formal_job_id';
      await run(`UPDATE design_search_rtl_candidates SET ${column}=? WHERE tenant_id=? AND campaign_id=? AND id=? AND ${column} IS NULL`,
        [job.id, identity.tenantId, campaignId, candidate.id]);
      await audit(identity, `design-search.rtl-${kind}-dispatched`, candidate.id,
        { campaignId, jobId: job.id, sourceHash: revised.sourceHash, requestHash: job.requestHash }, requestId);
    }
    if (!candidate.proofJobId) {
      const { inputs } = equivalenceInputs(base, revised);
      const job = createJob(identity, { projectId: campaign.projectId, kind: 'formal',
        idempotencyKey: `design-search:${candidate.id}:equivalence`, inputs,
        expectedCpuSeconds: 300, retentionDays: 90 });
      await run('INSERT INTO design_search_proofs (candidate_id,tenant_id,campaign_id,job_id,created_at) VALUES (?,?,?,?,?)',
        [candidate.id, identity.tenantId, campaignId, job.id, new Date().toISOString()]);
      await audit(identity, 'design-search.rtl-equivalence-dispatched', candidate.id,
        { campaignId, jobId: job.id, sourceHash: revised.sourceHash, referenceHash: base.sourceHash,
          requestHash: job.requestHash }, requestId);
    }
  });
  return searchCampaignDetails(identity, campaignId);
}

export async function dispatchSearchCandidate(identity: EdaIdentity, campaignId: string, candidateId: string, requestId: string): Promise<ReturnType<typeof searchCampaignDetails>> {
  if (identity.role === 'viewer') throw new Error('Editor role required');
  const details = await searchCampaignDetails(identity, campaignId);
  if (!details.verification.simulationPassed || !details.verification.formalPassed)
    throw new Error('Run and pass the fixed simulation and bounded formal checks for this revision before design search');
  const campaign = details.campaign;
  const requested = details.candidates.find((item) => item.id === candidateId);
  if (!requested) throw new Error('Candidate not found');
  if (requested.kind === 'rtl' && (!requested.verification?.simulationPassed || !requested.verification?.formalPassed ||
      !requested.verification?.proofPassed))
    throw new Error('RTL candidate must pass simulation, bounded safety, and exact-cycle equivalence before physical execution');
  if (requested.iteration !== 0 && !details.candidates.find((item) => item.iteration === 0)?.qualified)
    throw new Error('The locked baseline must qualify before other experiments run');
  const revision = await getRevision(identity, campaign.projectId, campaign.revisionId);
  if (!revision) throw new Error('Locked revision not found');
  if (pinnedImage('openroad') !== campaign.toolImage)
    throw new Error('Configured OpenROAD image differs from the locked campaign image');
  await commercialTransaction(async () => {
    await lockCommercialProject(identity.tenantId, campaign.projectId);
    const candidate = (await candidatesFor(identity, campaignId)).find((item) => item.id === candidateId);
    if (!candidate) throw new Error('Candidate not found');
    if (candidate.jobId) return;
    const testedRevision = candidateRevision(revision, candidate);
    if (candidate.kind === 'rtl' && (!verificationResult(identity, candidate, testedRevision, 'simulation', campaign.pdkDigest).passed ||
        !verificationResult(identity, candidate, testedRevision, 'formal', campaign.pdkDigest).passed ||
        !verificationResult(identity, candidate, testedRevision, 'equivalence', campaign.pdkDigest, revision).passed))
      throw new Error('RTL candidate verification evidence no longer passes');
    const rows = await candidatesFor(identity, campaignId);
    const used = rows.reduce((sum, item) => sum + (item.jobId ? getJob(identity, item.jobId)?.expectedCpuSeconds ?? 0 : 0), 0);
    if (used + campaign.jobCpuSeconds > campaign.maxCpuSeconds) throw new Error('Campaign execution-time budget exhausted');
    ensureExecutionProject(identity, campaign.projectId, campaign.pdkDigest);
    const job = createJob(identity, {
      projectId: campaign.projectId, kind: 'openroad',
      idempotencyKey: `design-search:${candidate.id}`,
      inputs: {
        'design.v': testedRevision.rtl,
        'constraint.sdc': testedRevision.sdc,
        'config.mk': buildOrfsConfig({ topModule: testedRevision.topModule, platform: 'sky130hd', coreUtilization: candidate.coreUtilization, placeDensity: candidate.placeDensity }),
        'flow.tcl': '# Fixed ORFS entry point; config.mk selects physical execution.\n',
      },
      expectedCpuSeconds: campaign.jobCpuSeconds,
      retentionDays: 90,
    });
    const candidateTable = candidate.kind === 'rtl' ? 'design_search_rtl_candidates' : 'design_search_candidates';
    await run(`UPDATE ${candidateTable} SET job_id=? WHERE tenant_id=? AND campaign_id=? AND id=? AND job_id IS NULL`,
      [job.id, identity.tenantId, campaignId, candidateId]);
    await audit(identity, 'design-search.candidate-dispatched', candidate.id,
      { campaignId, jobId: job.id, revisionId: revision.id, sourceHash: testedRevision.sourceHash,
        requestHash: job.requestHash, status: job.status }, requestId);
  });
  return searchCampaignDetails(identity, campaignId);
}

export async function dispatchSearchBatch(identity: EdaIdentity, campaignId: string, requestId: string): Promise<ReturnType<typeof searchCampaignDetails>> {
  let details = await searchCampaignDetails(identity, campaignId);
  const baselineQualified = details.candidates.find((item) => item.iteration === 0)?.qualified;
  const eligible = details.candidates.filter((item) => !item.jobId && (baselineQualified || item.iteration === 0) &&
    (item.kind !== 'rtl' || (item.verification?.simulationPassed && item.verification?.formalPassed && item.verification?.proofPassed)));
  for (const candidate of eligible) {
    if (details.usedCpuSeconds + details.campaign.jobCpuSeconds > details.campaign.maxCpuSeconds) break;
    details = await dispatchSearchCandidate(identity, campaignId, candidate.id, requestId);
  }
  return details;
}

export async function selectSearchCandidate(identity: EdaIdentity, campaignId: string, candidateId: string, rationale: string, requestId: string): Promise<ReturnType<typeof searchCampaignDetails>> {
  if (identity.role !== 'admin') throw new Error('Admin role required for experiment selection');
  if (rationale.trim().length < 20 || rationale.length > 1000) throw new Error('A 20–1000 character selection rationale is required');
  const details = await searchCampaignDetails(identity, campaignId);
  const selected = details.candidates.find((item) => item.id === candidateId);
  if (!selected?.qualified || !selected.jobId) throw new Error('Only a currently qualified, measured candidate can be selected');
  await commercialTransaction(async () => {
    await lockCommercialProject(identity.tenantId, details.campaign.projectId);
    const current = (await searchCampaignDetails(identity, campaignId)).candidates.find((item) => item.id === candidateId);
    if (!current?.qualified || !current.jobId) throw new Error('Candidate evidence no longer qualifies');
    await run('UPDATE design_search_campaigns SET selected_candidate_id=?,selected_by=?,selected_at=?,selection_rationale=?,updated_at=? WHERE tenant_id=? AND id=?',
      [candidateId, identity.userId, new Date().toISOString(), rationale.trim(), new Date().toISOString(), identity.tenantId, campaignId]);
    await audit(identity, 'design-search.candidate-selected', candidateId,
      { campaignId, jobId: current.jobId, score: current.score, rationale: rationale.trim() }, requestId);
  });
  return searchCampaignDetails(identity, campaignId);
}

export async function adoptSelectedRtl(identity: EdaIdentity, campaignId: string, requestId: string): Promise<{
  details: Awaited<ReturnType<typeof searchCampaignDetails>>;
  adoptedRevisionId: string;
}> {
  if (identity.role !== 'admin') throw new Error('Admin role required to adopt candidate RTL');
  const details = await searchCampaignDetails(identity, campaignId);
  const selected = details.candidates.find((item) => item.id === details.campaign.selectedCandidateId);
  if (!selected || selected.kind !== 'rtl' || !selected.rtl || !selected.qualified)
    throw new Error('Select a currently qualified RTL candidate before adoption');
  const base = await getRevision(identity, details.campaign.projectId, details.campaign.revisionId);
  if (!base || base.sourceHash !== details.campaign.sourceHash) throw new Error('Locked revision provenance mismatch');
  const saved = await commercialTransaction(async () => {
    await lockCommercialProject(identity.tenantId, details.campaign.projectId);
    const fresh = await searchCampaignDetails(identity, campaignId);
    const stillSelected = fresh.candidates.find((item) => item.id === fresh.campaign.selectedCandidateId);
    if (!stillSelected?.qualified || stillSelected.kind !== 'rtl' || stillSelected.id !== selected.id)
      throw new Error('Selected RTL evidence no longer qualifies');
    const revision = await saveRevision(identity, details.campaign.projectId, {
      baseRevisionId: base.id, templateId: base.templateId, topModule: base.topModule,
      specification: base.specification, requirements: base.requirements,
      rtl: selected.rtl, sdc: base.sdc, testbench: base.testbench, properties: base.properties,
    }, requestId);
    await audit(identity, 'design-search.rtl-adopted', selected.id,
      { campaignId, newRevisionId: revision.id, sourceHash: revision.sourceHash, jobId: selected.jobId }, requestId);
    return revision;
  });
  return { details: await searchCampaignDetails(identity, campaignId), adoptedRevisionId: saved.id };
}
