import 'server-only';

import os from 'os';
import { randomUUID } from 'crypto';
import { all, commercialDatabaseBackend, commercialTransaction, lockCommercialProject, one, run } from '@/lib/commercial/database';
import type { EdaIdentity } from '@/lib/eda/identity';
import { getRevision, journeyBundle, launchJourneyRun } from '@/lib/journey/store';
import { reportPassed } from '@/lib/journey/verification';
import { getSearchCampaign, researchCampaign, searchCampaignDetails, generateSearchCandidates,
  dispatchRtlVerification, dispatchSearchCandidate } from './store';
import { critiqueCandidates, researchDirections } from './roles';

export type AgentPhase = 'research' | 'reference' | 'baseline' | 'design' | 'critique' | 'execute' | 'evaluate' | 'complete';
export type AgentRunStatus = 'queued' | 'running' | 'waiting' | 'failed' | 'completed';
export type AgentRole = 'supervisor' | 'research' | 'design' | 'critic' | 'verification' | 'evaluation';

export interface AgentRun {
  id: string; tenantId: string; campaignId: string; projectId: string; createdBy: string;
  status: AgentRunStatus; phase: AgentPhase; round: number; error?: string;
  createdAt: string; updatedAt: string; completedAt?: string;
}
export interface AgentEvent {
  id: string; role: AgentRole; phase: AgentPhase; status: string; summary: string;
  details: Record<string, unknown>; model?: string; createdAt: string;
}
export interface AgentCandidateReview {
  candidateId: string; verdict: 'approved' | 'rejected'; reason: string;
  risks: string[]; model: string; createdAt: string;
}
export interface AgentTeam { run: AgentRun | null; events: AgentEvent[]; reviews: AgentCandidateReview[] }

type Row = Record<string, unknown>;
const now = () => new Date().toISOString();
const pending = (status: string) => ['queued', 'running', 'retry', 'awaiting_approval'].includes(status);
const MAX_ROUNDS = 3;

function fromRow(row: Row): AgentRun {
  return { id: String(row.id), tenantId: String(row.tenant_id), campaignId: String(row.campaign_id),
    projectId: String(row.project_id), createdBy: String(row.created_by), status: row.status as AgentRunStatus,
    phase: row.phase as AgentPhase, round: Number(row.round), error: row.error ? String(row.error) : undefined,
    createdAt: String(row.created_at), updatedAt: String(row.updated_at),
    completedAt: row.completed_at ? String(row.completed_at) : undefined };
}

async function event(agent: AgentRun, role: AgentRole, phase: AgentPhase, status: string,
  summary: string, details: Record<string, unknown> = {}, model?: string): Promise<void> {
  await run('INSERT INTO design_search_agent_events (id,tenant_id,run_id,role,phase,status,summary,details_json,model,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
    [randomUUID(), agent.tenantId, agent.id, role, phase, status, summary.slice(0, 500),
      JSON.stringify(details), model ?? null, now()]);
}

async function reviewsFor(agent: AgentRun): Promise<AgentCandidateReview[]> {
  const rows = await all('SELECT * FROM design_search_agent_reviews WHERE tenant_id=? AND run_id=? ORDER BY created_at,candidate_id',
    [agent.tenantId, agent.id]);
  return rows.map((row) => ({ candidateId: String(row.candidate_id),
    verdict: row.verdict as 'approved' | 'rejected', reason: String(row.reason),
    risks: JSON.parse(String(row.risks_json)) as string[], model: String(row.model), createdAt: String(row.created_at) }));
}

export async function agentTeamForCampaign(identity: EdaIdentity, campaignId: string): Promise<AgentTeam> {
  await getSearchCampaign(identity, campaignId);
  const row = await one('SELECT * FROM design_search_agent_runs WHERE tenant_id=? AND campaign_id=?', [identity.tenantId, campaignId]);
  if (!row) return { run: null, events: [], reviews: [] };
  const agent = fromRow(row);
  const events = await all('SELECT * FROM design_search_agent_events WHERE tenant_id=? AND run_id=? ORDER BY created_at,id LIMIT 200',
    [identity.tenantId, agent.id]);
  return { run: agent, events: events.map((item) => ({ id: String(item.id), role: item.role as AgentRole,
    phase: item.phase as AgentPhase, status: String(item.status), summary: String(item.summary),
    details: JSON.parse(String(item.details_json)) as Record<string, unknown>,
    model: item.model ? String(item.model) : undefined, createdAt: String(item.created_at) })),
    reviews: await reviewsFor(agent) };
}

export async function startAgentTeam(identity: EdaIdentity, campaignId: string): Promise<AgentTeam> {
  if (identity.role === 'viewer') throw new Error('Editor role required to start an agent team');
  const campaign = await getSearchCampaign(identity, campaignId);
  const details = await searchCampaignDetails(identity, campaignId);
  if (details.candidates.some((candidate) => candidate.kind !== 'baseline' &&
    (candidate.jobId || candidate.simulationJobId || candidate.formalJobId || candidate.proofJobId)))
    throw new Error('Start an agent team on a campaign before manually queueing candidate jobs');
  await commercialTransaction(async () => {
    await lockCommercialProject(identity.tenantId, campaign.projectId);
    const existing = await one('SELECT id FROM design_search_agent_runs WHERE tenant_id=? AND campaign_id=?', [identity.tenantId, campaignId]);
    if (existing) return;
    const agent: AgentRun = { id: randomUUID(), tenantId: identity.tenantId, campaignId, projectId: campaign.projectId,
      createdBy: identity.userId, status: 'queued', phase: 'research', round: 0, createdAt: now(), updatedAt: now() };
    await run('INSERT INTO design_search_agent_runs (id,tenant_id,campaign_id,project_id,created_by,status,phase,round,lease_owner,lease_expires_at,next_attempt_at,error,created_at,updated_at,completed_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      [agent.id, agent.tenantId, campaignId, campaign.projectId, agent.createdBy, agent.status, agent.phase,
        agent.round, null, null, agent.createdAt, null, agent.createdAt, agent.updatedAt, null]);
    await event(agent, 'supervisor', 'research', 'queued', 'Agent team started with the campaign candidate and execution limits.',
      { maxCandidates: campaign.maxCandidates, maxCpuSeconds: campaign.maxCpuSeconds });
  });
  return agentTeamForCampaign(identity, campaignId);
}

export async function retryAgentTeam(identity: EdaIdentity, campaignId: string): Promise<AgentTeam> {
  if (identity.role === 'viewer') throw new Error('Editor role required to retry an agent team');
  const campaign = await getSearchCampaign(identity, campaignId);
  await commercialTransaction(async () => {
    await lockCommercialProject(identity.tenantId, campaign.projectId);
    const changed = await run("UPDATE design_search_agent_runs SET status='queued',error=NULL,lease_owner=NULL,lease_expires_at=NULL,next_attempt_at=?,updated_at=? WHERE tenant_id=? AND campaign_id=? AND status='failed'",
      [now(), now(), identity.tenantId, campaignId]);
    if (!changed) throw new Error('Only a failed agent run can be retried');
    const row = await one('SELECT * FROM design_search_agent_runs WHERE tenant_id=? AND campaign_id=?', [identity.tenantId, campaignId]);
    await event(fromRow(row!), 'supervisor', fromRow(row!).phase, 'queued', 'Agent team retry requested.');
  });
  return agentTeamForCampaign(identity, campaignId);
}

async function claimAgentRun(workerId: string): Promise<AgentRun | null> {
  return commercialTransaction(async () => {
    const timestamp = now();
    const suffix = commercialDatabaseBackend === 'postgres' ? ' FOR UPDATE SKIP LOCKED' : '';
    const row = await one(`SELECT * FROM design_search_agent_runs WHERE status IN ('queued','waiting','running')
      AND next_attempt_at<=? AND (lease_expires_at IS NULL OR lease_expires_at<?)
      ORDER BY next_attempt_at,created_at LIMIT 1${suffix}`, [timestamp, timestamp]);
    if (!row) return null;
    const lease = new Date(Date.now() + 900_000).toISOString();
    const changed = await run('UPDATE design_search_agent_runs SET status=?,lease_owner=?,lease_expires_at=?,updated_at=? WHERE id=? AND (lease_expires_at IS NULL OR lease_expires_at<?)',
      ['running', workerId, lease, timestamp, row.id, timestamp]);
    return changed ? fromRow({ ...row, status: 'running' }) : null;
  });
}

type Step = { phase: AgentPhase; status?: AgentRunStatus; delayMs?: number; round?: number;
  role?: AgentRole; summary?: string; details?: Record<string, unknown>; model?: string };
const wait = (phase: AgentPhase, summary?: string, details?: Record<string, unknown>): Step =>
  ({ phase, status: 'waiting', delayMs: 10_000, role: 'verification', summary, details });

async function researchBrief(agent: AgentRun): Promise<string> {
  const row = await one("SELECT details_json FROM design_search_agent_events WHERE tenant_id=? AND run_id=? AND role='research' AND status='completed' ORDER BY created_at DESC LIMIT 1",
    [agent.tenantId, agent.id]);
  if (!row) throw new Error('Research brief is missing');
  const details = JSON.parse(String(row.details_json)) as { brief?: string };
  if (!details.brief) throw new Error('Research brief is empty');
  return details.brief;
}

async function advance(agent: AgentRun): Promise<Step> {
  const identity: EdaIdentity = { tenantId: agent.tenantId, userId: `agent-team:${agent.id}`, role: 'editor' };
  const requestId = `agent-team:${agent.id}:${agent.phase}`;
  const campaign = await getSearchCampaign(identity, agent.campaignId);
  const revision = await getRevision(identity, campaign.projectId, campaign.revisionId);
  if (!revision || revision.sourceHash !== campaign.sourceHash) throw new Error('Locked campaign revision changed');

  if (agent.phase === 'research') {
    const researched = await researchCampaign(identity, agent.campaignId, requestId);
    const result = await researchDirections({ revision, objective: campaign.objective, literature: researched.literature });
    return { phase: 'reference', role: 'research', summary: 'Research agent selected source-backed search directions.',
      details: { ...result.brief, sourceCount: researched.literature.length }, model: result.model };
  }

  if (agent.phase === 'reference') {
    const details = await searchCampaignDetails(identity, agent.campaignId);
    if (details.verification.simulationPassed && details.verification.formalPassed)
      return { phase: 'baseline', role: 'verification', summary: 'Locked source passed simulation and bounded formal verification.' };
    const purpose = revision.templateId === 'custom' ? 'regression' : 'lab';
    const bundle = await journeyBundle(identity, campaign.projectId);
    const matching = bundle.runs.filter((item) => item.revisionId === revision.id && item.purpose === purpose &&
      (item.kind === 'simulation' || item.kind === 'formal'));
    let queued = false;
    for (const kind of ['simulation', 'formal'] as const) {
      if (matching.some((item) => item.kind === kind)) continue;
      await launchJourneyRun(identity, campaign.projectId,
        { revisionId: revision.id, kind, purpose, idempotencyKey: `agent-team:${agent.id}:reference:${kind}` }, requestId);
      queued = true;
    }
    if (matching.some((item) => item.jobStatus === 'failed' || item.jobStatus === 'cancelled' ||
        (item.jobStatus === 'succeeded' && (!item.report || !reportPassed(item.report)))))
      throw new Error('Locked source verification failed; inspect the source jobs');
    return wait('reference', queued ? 'Verification agent queued the locked source checks.' : undefined);
  }

  if (agent.phase === 'baseline') {
    const details = await searchCampaignDetails(identity, agent.campaignId);
    const baseline = details.candidates.find((item) => item.kind === 'baseline');
    if (!baseline) throw new Error('Campaign baseline is missing');
    if (baseline.qualified) return { phase: 'design', role: 'verification', summary: 'Measured baseline qualified for the locked objective.',
      details: { candidateId: baseline.id, metrics: baseline.metrics } };
    if (!baseline.jobId) {
      const queued = await dispatchSearchCandidate(identity, agent.campaignId, baseline.id, requestId);
      const job = queued.candidates.find((item) => item.id === baseline.id);
      return wait('baseline', 'Verification agent queued the unchanged physical baseline.', { jobId: job?.jobId });
    }
    if (!pending(baseline.status)) throw new Error(`Measured baseline did not qualify: ${baseline.reasons.join('; ') || baseline.status}`);
    return wait('baseline');
  }

  if (agent.phase === 'design') {
    const details = await searchCampaignDetails(identity, agent.campaignId);
    const reviews = await reviewsFor(agent);
    if (details.candidates.some((item) => item.kind !== 'baseline' && !reviews.some((review) => review.candidateId === item.id)))
      return { phase: 'critique' };
    if (agent.round >= MAX_ROUNDS || details.candidates.length >= campaign.maxCandidates ||
        details.usedCpuSeconds + campaign.jobCpuSeconds > campaign.maxCpuSeconds)
      return { phase: 'complete', status: 'completed', role: 'supervisor', summary: 'Agent team reached its round, candidate, or execution budget.' };
    const proposed = await generateSearchCandidates(identity, agent.campaignId, requestId, await researchBrief(agent));
    return { phase: 'critique', role: 'design', summary: 'Design agent proposed source-backed experiments.',
      details: { candidateIds: proposed.candidates.filter((item) => item.kind !== 'baseline' &&
        !reviews.some((review) => review.candidateId === item.id)).map((item) => item.id), round: agent.round + 1 } };
  }

  if (agent.phase === 'critique') {
    const details = await searchCampaignDetails(identity, agent.campaignId);
    const reviewed = new Set((await reviewsFor(agent)).map((item) => item.candidateId));
    const candidates = details.candidates.filter((item) => item.kind !== 'baseline' && !reviewed.has(item.id));
    if (!candidates.length) return { phase: 'execute' };
    const result = await critiqueCandidates({ revision, objective: campaign.objective,
      literature: campaign.literature, candidates, researchBrief: await researchBrief(agent) });
    await commercialTransaction(async () => {
      await lockCommercialProject(agent.tenantId, campaign.projectId);
      for (const review of result.reviews) {
        await run('INSERT INTO design_search_agent_reviews (candidate_id,tenant_id,run_id,verdict,reason,risks_json,model,created_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(candidate_id) DO NOTHING',
          [review.candidateId, agent.tenantId, agent.id, review.approve ? 'approved' : 'rejected',
            review.reason, JSON.stringify(review.risks), result.model, now()]);
      }
    });
    return { phase: candidates.length > result.reviews.length ? 'critique' : 'execute',
      role: 'critic', summary: 'Independent critic reviewed proposed experiments before tool execution.',
      details: { reviews: result.reviews.map((item) => ({ candidateId: item.candidateId,
        verdict: item.approve ? 'approved' : 'rejected', reason: item.reason, risks: item.risks })) }, model: result.model };
  }

  if (agent.phase === 'execute') {
    const details = await searchCampaignDetails(identity, agent.campaignId);
    const approved = new Set((await reviewsFor(agent)).filter((item) => item.verdict === 'approved').map((item) => item.candidateId));
    for (const candidate of details.candidates.filter((item) => approved.has(item.id))) {
      if (candidate.kind === 'rtl' && !candidate.jobId) {
        const checks = candidate.verification;
        const statuses = [checks?.simulationStatus, checks?.formalStatus, checks?.proofStatus];
        if (statuses.some((status) => status === 'not queued')) {
          await dispatchRtlVerification(identity, agent.campaignId, candidate.id, requestId);
          return wait('execute', 'Verification agent queued simulation, safety, and equivalence checks.', { candidateId: candidate.id });
        }
        if (statuses.some((status) => status && pending(status))) return wait('execute');
        if (!checks?.simulationPassed || !checks.formalPassed || !checks.proofPassed) continue;
      }
      if (!candidate.jobId) {
        if (details.usedCpuSeconds + campaign.jobCpuSeconds > campaign.maxCpuSeconds) break;
        const dispatched = await dispatchSearchCandidate(identity, agent.campaignId, candidate.id, requestId);
        const job = dispatched.candidates.find((item) => item.id === candidate.id);
        return wait('execute', 'Verification agent queued a critic-approved physical experiment.',
          { candidateId: candidate.id, jobId: job?.jobId });
      }
      if (pending(candidate.status)) return wait('execute');
    }
    return { phase: 'evaluate' };
  }

  if (agent.phase === 'evaluate') {
    const details = await searchCampaignDetails(identity, agent.campaignId);
    const exhausted = agent.round + 1 >= MAX_ROUNDS || details.candidates.length >= campaign.maxCandidates ||
      details.usedCpuSeconds + campaign.jobCpuSeconds > campaign.maxCpuSeconds;
    return { phase: exhausted ? 'complete' : 'design', status: exhausted ? 'completed' : 'queued',
      round: agent.round + 1, role: 'evaluation', summary: 'Evaluation agent compared retained, verified measurements and updated the search frontier.',
      details: { bestCandidateId: details.bestCandidateId,
        qualified: details.candidates.filter((item) => item.qualified).map((item) => ({ id: item.id, score: item.score,
          metrics: item.metrics })), usedCpuSeconds: details.usedCpuSeconds, continuing: !exhausted } };
  }

  return { phase: 'complete', status: 'completed' };
}

async function finish(agent: AgentRun, workerId: string, step: Step, error?: string): Promise<void> {
  await commercialTransaction(async () => {
    const timestamp = now();
    const status = error ? 'failed' : step.status ?? 'queued';
    const next = new Date(Date.now() + (step.delayMs ?? 0)).toISOString();
    const changed = await run('UPDATE design_search_agent_runs SET status=?,phase=?,round=?,lease_owner=NULL,lease_expires_at=NULL,next_attempt_at=?,error=?,updated_at=?,completed_at=? WHERE id=? AND tenant_id=? AND lease_owner=?',
      [status, step.phase, step.round ?? agent.round, next, error ?? null, timestamp,
        status === 'completed' ? timestamp : null, agent.id, agent.tenantId, workerId]);
    if (!changed) return;
    if (error) await event(agent, 'supervisor', agent.phase, 'failed', 'Agent step failed; an editor may retry it.', { error });
    else if (step.summary) await event(agent, step.role ?? 'supervisor', agent.phase, 'completed',
      step.summary, step.details, step.model);
  });
}

/** One durable transition. Long-running EDA jobs are polled on later leases. */
export async function runAgentWorker(options: { once?: boolean; pollMs?: number } = {}): Promise<void> {
  const workerId = `design-agent:${os.hostname()}:${process.pid}`;
  do {
    const agent = await claimAgentRun(workerId);
    if (agent) {
      try { await finish(agent, workerId, await advance(agent)); }
      catch (reason) {
        const message = reason instanceof Error ? reason.message.slice(0, 500) : 'Agent step failed';
        await finish(agent, workerId, { phase: agent.phase }, message);
      }
    } else if (!options.once) await new Promise((resolve) => setTimeout(resolve, options.pollMs ?? 3000));
  } while (!options.once);
}
