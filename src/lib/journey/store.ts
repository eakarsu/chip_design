import 'server-only';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import type { EdaIdentity } from '@/lib/eda/identity';
import { all, one, run, commercialTransaction, lockCommercialProject } from '@/lib/commercial/database';
import { createWorkspaceProject } from '@/lib/commercial/store';
import {
  createJob,
  createProject,
  getJob,
  jobWorkspace,
  listProjects,
  pinnedImage,
  readArtifact,
  verifyJobInputs,
} from '@/lib/eda/store';
import { SKY130_REFERENCE_PROJECT } from '@/lib/eda/referenceCase';
import { buildOrfsConfig, buildYosysFlow } from '@/lib/operations/domain';
import { debugChallenges, defaultSdc, journeyTemplate } from './catalog';
import { revisionSchema } from './schema';
import {
  digest,
  expectedChecks,
  referenceProperties,
  referenceTestbench,
  reportPassed,
  revisionDigest,
  verificationInputs,
  verificationReportSchema,
} from './verification';
import type {
  DesignRevision,
  JourneyArtifact,
  JourneyAssessment,
  JourneyBundle,
  JourneyRun,
  JourneyRunKind,
  TemplateId,
} from './types';

type Row = Record<string, unknown>;
const now = () => new Date().toISOString();
const document = <T>(row: Row): T => JSON.parse(String(row.document_json)) as T;

function requireEditor(identity: EdaIdentity): void {
  if (!['admin', 'editor'].includes(identity.role)) throw new Error('Editor membership is required');
}

export async function ownedJourneyProject(identity: EdaIdentity, projectId: string) {
  const project = await one('SELECT id,name,top_module,pdk_ref FROM commercial_projects WHERE tenant_id=? AND id=?', [
    identity.tenantId,
    projectId,
  ]);
  if (!project) throw new Error('Project not found for this tenant');
  return {
    id: String(project.id),
    name: String(project.name),
    topModule: String(project.top_module),
    pdkRef: String(project.pdk_ref),
  };
}

async function audit(
  identity: EdaIdentity,
  projectId: string,
  action: string,
  id: string,
  details: unknown,
  requestId: string
) {
  await run(
    'INSERT INTO commercial_audit_events (id,tenant_id,actor_id,action,resource,resource_id,details_json,request_id,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
    [
      randomUUID(),
      identity.tenantId,
      identity.userId,
      action,
      'design_journey',
      id,
      JSON.stringify({ projectId, details }),
      requestId,
      now(),
    ]
  );
}

export async function getRevision(
  identity: EdaIdentity,
  projectId: string,
  revisionId?: string
): Promise<DesignRevision | null> {
  await ownedJourneyProject(identity, projectId);
  const row = await one(
    'SELECT document_json FROM design_journey_revisions WHERE tenant_id=? AND project_id=?' +
      (revisionId ? ' AND id=?' : ' ORDER BY revision_number DESC LIMIT 1'),
    [identity.tenantId, projectId, ...(revisionId ? [revisionId] : [])]
  );
  if (revisionId && !row) throw new Error('Revision not found for this project');
  return row ? document<DesignRevision>(row) : null;
}

export async function saveRevision(
  identity: EdaIdentity,
  projectId: string,
  raw: unknown,
  requestId: string,
  challengeId?: string
): Promise<DesignRevision> {
  requireEditor(identity);
  const input = revisionSchema.parse(raw);
  return commercialTransaction(async () => {
    await lockCommercialProject(identity.tenantId, projectId);
    const latest = await getRevision(identity, projectId);
    if ((latest?.id ?? null) !== input.baseRevisionId)
      throw new Error('Revision conflict: reload the project before saving');
    if (latest && latest.templateId !== input.templateId)
      throw new Error('Create a separate project to change its reference interface');
    const { baseRevisionId: _base, ...sources } = input;
    const revision: DesignRevision = {
      ...sources,
      id: randomUUID(),
      projectId,
      number: (latest?.number ?? 0) + 1,
      sourceHash: revisionDigest(sources),
      createdBy: identity.userId,
      createdAt: now(),
      challengeId: challengeId ?? latest?.challengeId,
    };
    await run(
      'INSERT INTO design_journey_revisions (id,tenant_id,project_id,revision_number,source_hash,document_json,created_by,created_at) VALUES (?,?,?,?,?,?,?,?)',
      [
        revision.id,
        identity.tenantId,
        projectId,
        revision.number,
        revision.sourceHash,
        JSON.stringify(revision),
        identity.userId,
        revision.createdAt,
      ]
    );
    await run('UPDATE commercial_projects SET top_module=?,updated_at=? WHERE tenant_id=? AND id=?', [
      revision.topModule,
      revision.createdAt,
      identity.tenantId,
      projectId,
    ]);
    await audit(
      identity,
      projectId,
      'journey.revision.saved',
      revision.id,
      { sourceHash: revision.sourceHash, previousRevision: latest?.id },
      requestId
    );
    return revision;
  });
}

export async function startJourney(
  identity: EdaIdentity,
  input: { templateId: TemplateId; name: string; projectId?: string },
  requestId: string
): Promise<DesignRevision> {
  requireEditor(identity);
  const template = journeyTemplate(input.templateId);
  const project = input.projectId
    ? await ownedJourneyProject(identity, input.projectId)
    : await createWorkspaceProject(
        identity,
        {
          name: input.name,
          description: template.description,
          repositoryUrl: '',
          defaultBranch: 'main',
          topModule: template.topModule,
          pdkRef: SKY130_REFERENCE_PROJECT.pdkRef,
          status: 'active',
        },
        requestId
      );
  return saveRevision(
    identity,
    project.id,
    {
      baseRevisionId: null,
      templateId: template.id,
      topModule: template.topModule,
      specification: template.description,
      requirements: template.requirements,
      rtl: template.rtl,
      sdc: defaultSdc(template.topModule),
      testbench: referenceTestbench(template.id),
      properties: referenceProperties(template.id),
    },
    requestId
  );
}

export async function startChallenge(
  identity: EdaIdentity,
  projectId: string,
  challengeId: string,
  baseRevisionId: string,
  requestId: string
): Promise<DesignRevision> {
  const current = await getRevision(identity, projectId, baseRevisionId);
  const challenge = debugChallenges.find((item) => item.id === challengeId);
  if (!current || !challenge) throw new Error('Challenge or revision not found');
  if (challenge.templateId !== current.templateId)
    throw new Error('Choose a challenge for the current project template');
  const sources = challenge.apply(current);
  const { rtl, sdc, testbench, properties } = sources;
  return saveRevision(
    identity,
    projectId,
    {
      baseRevisionId,
      templateId: current.templateId,
      topModule: journeyTemplate(current.templateId).topModule,
      specification: current.specification,
      requirements: journeyTemplate(current.templateId).requirements,
      rtl,
      sdc,
      testbench,
      properties,
    },
    requestId,
    challengeId
  );
}

function ensureExecutionProject(identity: EdaIdentity, projectId: string) {
  const existing = listProjects(identity).find((item) => item.id === projectId);
  if (existing) return existing;
  const configuredPdk =
    process.env.CHIP_JOURNEY_PDK_DIGEST ||
    process.env.CHIP_OPENROAD_IMAGE?.split('@sha256:')[1] ||
    SKY130_REFERENCE_PROJECT.pdkDigest;
  try {
    return createProject(identity, {
      ...SKY130_REFERENCE_PROJECT,
      id: projectId,
      name: `Workspace ${projectId}`,
      pdkDigest: configuredPdk,
    });
  } catch (error) {
    const concurrentlyCreated = listProjects(identity).find((item) => item.id === projectId);
    if (concurrentlyCreated) return concurrentlyCreated;
    throw error;
  }
}

export async function launchJourneyRun(
  identity: EdaIdentity,
  projectId: string,
  input: {
    revisionId: string;
    kind: JourneyRunKind;
    purpose: 'lab' | 'regression';
    idempotencyKey: string;
  },
  requestId: string
): Promise<JourneyRun> {
  requireEditor(identity);
  const revision = await getRevision(identity, projectId, input.revisionId);
  if (!revision) throw new Error('Save a source revision before running');
  let inputs: Record<string, string>;
  let suiteHash: string;
  if (input.kind === 'simulation' || input.kind === 'formal') {
    if (input.purpose === 'lab' && revision.topModule !== journeyTemplate(revision.templateId).topModule)
      throw new Error('Graded runs must retain the reference top-level interface');
    ({ inputs, suiteHash } = verificationInputs(revision, input.kind, input.purpose));
  } else {
    if (input.purpose === 'lab') throw new Error('Use simulation or formal verification for automatic lab grading');
    inputs = { 'design.v': revision.rtl, 'constraint.sdc': revision.sdc };
    if (input.kind === 'yosys') inputs['flow.ys'] = buildYosysFlow(revision.topModule);
    else {
      inputs['flow.tcl'] = '# Fixed ORFS entry point; config.mk selects physical execution.\n';
      inputs['config.mk'] = buildOrfsConfig({
        topModule: revision.topModule,
        platform: 'sky130hd',
        coreUtilization: 38,
        placeDensity: 0.55,
      });
    }
    suiteHash = digest(JSON.stringify(inputs));
  }
  pinnedImage(input.kind); // Fail before creating an execution project when a tool is unavailable.
  ensureExecutionProject(identity, projectId);
  // The queue is a separate durable store. Its idempotency contract makes a
  // retry recover the same job if the commercial link write is interrupted.
  const job = createJob(identity, {
    projectId,
    kind: input.kind,
    inputs,
    idempotencyKey: input.idempotencyKey,
    expectedCpuSeconds: input.kind === 'openroad' ? 1800 : input.kind === 'formal' ? 300 : 180,
  });
  const id = await commercialTransaction(async () => {
    await lockCommercialProject(identity.tenantId, projectId);
    const previous = await one('SELECT id FROM design_journey_runs WHERE tenant_id=? AND job_id=?', [
      identity.tenantId,
      job.id,
    ]);
    if (previous) return String(previous.id);
    const runId = randomUUID();
    await run(
      'INSERT INTO design_journey_runs (id,tenant_id,project_id,revision_id,job_id,kind,purpose,source_hash,suite_hash,challenge_id,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
      [
        runId,
        identity.tenantId,
        projectId,
        revision.id,
        job.id,
        input.kind,
        input.purpose,
        revision.sourceHash,
        suiteHash,
        revision.challengeId ?? null,
        identity.userId,
        now(),
      ]
    );
    await audit(
      identity,
      projectId,
      'journey.run.queued',
      runId,
      { jobId: job.id, revisionId: revision.id, kind: input.kind, purpose: input.purpose },
      requestId
    );
    return runId;
  });
  return getJourneyRun(identity, projectId, id);
}

export function verifiedRunArtifact(
  identity: EdaIdentity,
  jobId: string,
  artifact: JourneyArtifact,
  limit = 4_000_000
): Buffer {
  const retained = readArtifact(identity, jobId, artifact.id);
  if (!retained || retained.size > limit || retained.size !== artifact.size || retained.sha256 !== artifact.sha256)
    throw new Error('Artifact is missing or exceeds preview limits');
  const stat = fs.lstatSync(retained.path);
  const job = getJob(identity, jobId);
  const outputRoot = job && fs.realpathSync(path.join(jobWorkspace(job), 'output')) + path.sep;
  if (
    !outputRoot ||
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.size !== retained.size ||
    !fs.realpathSync(retained.path).startsWith(outputRoot)
  )
    throw new Error('Artifact integrity check failed');
  const body = fs.readFileSync(retained.path);
  if (digest(body) !== retained.sha256) throw new Error('Artifact checksum mismatch');
  return body;
}

export async function getJourneyRun(identity: EdaIdentity, projectId: string, runId: string): Promise<JourneyRun> {
  await ownedJourneyProject(identity, projectId);
  const row = await one('SELECT * FROM design_journey_runs WHERE id=? AND tenant_id=? AND project_id=?', [
    runId,
    identity.tenantId,
    projectId,
  ]);
  if (!row) throw new Error('Run not found for this project');
  const job = getJob(identity, String(row.job_id));
  if (!job || job.projectId !== projectId) throw new Error('Execution job not found for this project');
  const result: JourneyRun = {
    id: String(row.id),
    projectId,
    revisionId: String(row.revision_id),
    jobId: job.id,
    kind: job.kind,
    purpose: String(row.purpose) as JourneyRun['purpose'],
    sourceHash: String(row.source_hash),
    suiteHash: String(row.suite_hash),
    createdBy: String(row.created_by),
    createdAt: String(row.created_at),
    challengeId: row.challenge_id ? String(row.challenge_id) : undefined,
    jobStatus: job.status,
    error: job.error,
    artifactsExpiredAt: job.artifactsExpiredAt,
    ...(job.artifactsExpiredAt
      ? {
          reportError:
            'Execution evidence expired under its retention policy; rerun this revision to retain new evidence.',
        }
      : {}),
    artifacts: (job.resultManifest?.artifacts ?? []) as JourneyArtifact[],
  };
  const artifact = result.artifacts.find((item) => item.relativePath === 'verification-report.json');
  if (artifact && job.status === 'succeeded') {
    try {
      if (job.resultManifest?.requestHash !== job.requestHash || job.resultManifest?.toolImage !== job.toolImage)
        throw new Error('Execution provenance mismatch');
      const report = verificationReportSchema.parse(
        JSON.parse(verifiedRunArtifact(identity, job.id, artifact, 2_000_000).toString('utf8'))
      );
      if (
        report.sourceHash !== result.sourceHash ||
        report.suiteHash !== result.suiteHash ||
        report.kind !== result.kind
      )
        throw new Error('Verification report does not match this source revision and suite');
      result.report = report;
    } catch (error) {
      result.reportError = error instanceof Error ? error.message : 'Report verification failed';
    }
  }
  return result;
}

/** Read the actual retained input, including the fixed harness used for grading. */
export async function journeyRunInputs(
  identity: EdaIdentity,
  projectId: string,
  runId: string
): Promise<Record<string, string>> {
  const execution = await getJourneyRun(identity, projectId, runId);
  const job = getJob(identity, execution.jobId)!;
  if (job.artifactsExpiredAt)
    throw new Error('Execution evidence expired; rerun this revision to retain new inputs and reports');
  const entries = job.inputManifest.files as Array<{ name: string; size: number; sha256: string }>;
  const root = fs.realpathSync(path.join(jobWorkspace(job), 'input')) + path.sep;
  const files: Record<string, string> = {};
  let size = 0;
  for (const entry of entries) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/.test(entry.name) || entry.name.includes('..'))
      throw new Error('Unsafe retained input');
    const filename = path.join(root, entry.name);
    const stat = fs.lstatSync(filename);
    size += stat.size;
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      !fs.realpathSync(filename).startsWith(root) ||
      size > 1_000_000 ||
      stat.size !== entry.size
    )
      throw new Error('Retained input integrity check failed');
    const body = fs.readFileSync(filename);
    if (digest(body) !== entry.sha256) throw new Error('Retained input checksum mismatch');
    files[entry.name] = body.toString('utf8');
  }
  return files;
}

export async function gradeJourneyRun(
  identity: EdaIdentity,
  projectId: string,
  runId: string,
  explanation: string,
  requestId: string
): Promise<JourneyAssessment> {
  requireEditor(identity);
  if (explanation.trim().length < 20 || explanation.length > 12000)
    throw new Error('Explain your observation or change in at least 20 characters');
  const execution = await getJourneyRun(identity, projectId, runId);
  if (execution.createdBy !== identity.userId)
    throw new Error('Only your own executed work can receive learning credit');
  if (execution.purpose !== 'lab' || !['simulation', 'formal'].includes(execution.kind))
    throw new Error('Only a fixed grading-suite run can receive learning credit');
  if (execution.challengeId && execution.kind !== 'simulation')
    throw new Error('Challenge credit requires the fixed simulation suite covering its acceptance requirements');
  if (!['succeeded', 'failed', 'cancelled'].includes(execution.jobStatus))
    throw new Error('Wait for the tool to finish before grading');
  const revision = (await getRevision(identity, projectId, execution.revisionId))!;
  const expected = expectedChecks(revision.templateId, execution.kind as 'simulation' | 'formal');
  const report = execution.report;
  verifyJobInputs(getJob(identity, execution.jobId)!);
  const checked = expected.filter((id) =>
    report?.checks.some((check) => check.id === id && check.status === 'passed')
  ).length;
  const reproducible = Boolean(report && !execution.reportError && execution.jobStatus === 'succeeded');
  const passed = reproducible && reportPassed(report!, expected);
  return commercialTransaction(async () => {
    await lockCommercialProject(identity.tenantId, projectId);
    const previous = await one(
      'SELECT document_json FROM design_journey_assessments WHERE tenant_id=? AND run_id=? AND user_id=?',
      [identity.tenantId, runId, identity.userId]
    );
    if (previous) {
      const retained = document<JourneyAssessment>(previous);
      if (retained.technicalPassed && !passed)
        throw new Error(
          'Previously graded execution evidence no longer verifies; inspect its artifacts before proceeding'
        );
      return retained;
    }
    const assessment: JourneyAssessment = {
      id: randomUUID(),
      runId,
      revisionId: revision.id,
      challengeId: execution.challengeId,
      correctness: Math.round((60 * checked) / expected.length),
      reproducibility: reproducible ? 25 : 0,
      explanation: explanation.trim(),
      explanationScore: null,
      technicalPassed: passed,
      userId: identity.userId,
      createdAt: now(),
      feedback: passed
        ? 'Executed checks passed and artifact provenance was verified. Explanation awaits independent instructor review.'
        : execution.reportError ||
          execution.error ||
          'Revise the failing behavior and rerun. Missing or skipped checks cannot earn a pass.',
    };
    await run(
      'INSERT INTO design_journey_assessments (id,tenant_id,project_id,run_id,user_id,document_json,created_at) VALUES (?,?,?,?,?,?,?)',
      [
        assessment.id,
        identity.tenantId,
        projectId,
        runId,
        identity.userId,
        JSON.stringify(assessment),
        assessment.createdAt,
      ]
    );
    await audit(
      identity,
      projectId,
      'journey.lab.graded',
      assessment.id,
      { runId, correctness: assessment.correctness, reproducibility: assessment.reproducibility, passed },
      requestId
    );
    return assessment;
  });
}

export async function reviewExplanation(
  identity: EdaIdentity,
  projectId: string,
  assessmentId: string,
  score: number,
  feedback: string,
  requestId: string
) {
  if (identity.role !== 'admin') throw new Error('Instructor/admin membership is required');
  if (!Number.isInteger(score) || score < 0 || score > 15 || feedback.trim().length < 20)
    throw new Error('Use a score from 0 to 15 and substantive review feedback');
  return commercialTransaction(async () => {
    await lockCommercialProject(identity.tenantId, projectId);
    const row = await one(
      'SELECT document_json FROM design_journey_assessments WHERE id=? AND tenant_id=? AND project_id=?',
      [assessmentId, identity.tenantId, projectId]
    );
    if (!row) throw new Error('Assessment not found');
    const assessment = document<JourneyAssessment>(row);
    if (assessment.userId === identity.userId) throw new Error('An independent instructor must review the explanation');
    if (assessment.reviewerId) throw new Error('This explanation has already been reviewed');
    const reviewed = { ...assessment, explanationScore: score, reviewerId: identity.userId, feedback: feedback.trim() };
    await run('UPDATE design_journey_assessments SET document_json=? WHERE id=? AND tenant_id=?', [
      JSON.stringify(reviewed),
      assessmentId,
      identity.tenantId,
    ]);
    await audit(identity, projectId, 'journey.explanation.reviewed', assessmentId, { score }, requestId);
    return reviewed;
  });
}

export function nextJourneyAction(revision: DesignRevision | null, runs: JourneyRun[]): JourneyBundle['nextAction'] {
  if (!revision)
    return {
      title: 'Start a reference project',
      detail: 'Choose a project to connect the lesson, source files and execution evidence.',
      tab: 'sources',
      lesson: 'product-requirements-and-architecture',
    };
  const current = runs.filter((item) => item.revisionId === revision.id);
  const simulation = current.find((item) => item.kind === 'simulation' && item.purpose === 'lab');
  if (!simulation?.report || !reportPassed(simulation.report))
    return {
      title: simulation?.report ? 'Debug the first failing check' : 'Run the reference simulation',
      detail:
        simulation?.report?.checks.find((item) => item.status !== 'passed')?.message ||
        'Execute the fixed testbench against this exact revision, then inspect its waveform and checks.',
      tab: 'verification',
      lesson: simulation?.report?.checks.some((item) => item.requirementId === 'reset' && item.status !== 'passed')
        ? 'clock-reset-and-cdc'
        : 'functional-verification',
    };
  if (!current.some((item) => item.kind === 'formal' && item.report && reportPassed(item.report)))
    return {
      title: 'Check the formal safety contract',
      detail: 'Inspect the harness assumptions and bounded proof scope before interpreting its result.',
      tab: 'verification',
      lesson: 'functional-verification',
    };
  if (
    !current.some(
      (item) =>
        item.kind === 'yosys' &&
        item.jobStatus === 'succeeded' &&
        item.artifacts.some((artifact) => /netlist\.(json|v)$/.test(artifact.relativePath))
    )
  )
    return {
      title: 'Synthesize this revision',
      detail: 'Inspect the mapped netlist and cell statistics, then compare them with the RTL intent.',
      tab: 'verification',
      lesson: 'logic-synthesis-and-dft',
    };
  if (
    !current.some(
      (item) =>
        item.kind === 'openroad' &&
        item.jobStatus === 'succeeded' &&
        item.artifacts.some((artifact) => /\.gds$/.test(artifact.relativePath))
    )
  )
    return {
      title: 'Run physical implementation',
      detail: 'Request the budgeted RTL-to-GDS job, then inspect timing, placement, routing and layout evidence.',
      tab: 'verification',
      lesson: 'floorplanning-and-power-intent',
    };
  return {
    title: 'Prepare hardware validation',
    detail:
      'Review physical evidence and release approvals, export the design package, and link board or silicon measurements to requirements.',
    tab: 'hardware',
    lesson: 'post-silicon-validation',
  };
}

export async function journeyBundle(identity: EdaIdentity, projectId: string): Promise<JourneyBundle> {
  const project = await ownedJourneyProject(identity, projectId);
  const revisionRows = await all(
    'SELECT document_json FROM design_journey_revisions WHERE tenant_id=? AND project_id=? ORDER BY revision_number DESC LIMIT 100',
    [identity.tenantId, projectId]
  );
  const revisions = revisionRows.map((row) => document<DesignRevision>(row));
  const runRows = await all(
    'SELECT id FROM design_journey_runs WHERE tenant_id=? AND project_id=? ORDER BY created_at DESC LIMIT 100',
    [identity.tenantId, projectId]
  );
  const runs = await Promise.all(runRows.map((row) => getJourneyRun(identity, projectId, String(row.id))));
  const assessmentRows = await all(
    'SELECT document_json FROM design_journey_assessments WHERE tenant_id=? AND project_id=?' +
      (identity.role === 'admin' ? '' : ' AND user_id=?') +
      ' ORDER BY created_at DESC LIMIT 100',
    [identity.tenantId, projectId, ...(identity.role === 'admin' ? [] : [identity.userId])]
  );
  const measurements = await all(
    'SELECT document_json FROM design_journey_hardware WHERE tenant_id=? AND project_id=? AND kind=? ORDER BY created_at DESC LIMIT 200',
    [identity.tenantId, projectId, 'measurement']
  );
  const capabilities = Object.fromEntries(
    (['simulation', 'formal', 'yosys', 'openroad'] as const).map((kind) => {
      try {
        pinnedImage(kind);
        return [kind, true];
      } catch {
        return [kind, false];
      }
    })
  ) as JourneyBundle['capabilities'];
  return {
    project,
    revision: revisions[0] ?? null,
    revisions: revisions.map(({ id, number, sourceHash, createdAt, challengeId }) => ({
      id,
      number,
      sourceHash,
      createdAt,
      challengeId,
    })),
    runs,
    assessments: assessmentRows.map((row) => document<JourneyAssessment>(row)),
    measurements: measurements.map((row) => document(row)),
    canEdit: ['admin', 'editor'].includes(identity.role),
    role: identity.role,
    userId: identity.userId,
    capabilities,
    nextAction: nextJourneyAction(revisions[0] ?? null, runs),
  };
}

export async function journeyProjects(identity: EdaIdentity) {
  return all<{ id: string; name: string; top_module: string }>(
    'SELECT id,name,top_module FROM commercial_projects WHERE tenant_id=? ORDER BY updated_at DESC',
    [identity.tenantId]
  );
}
