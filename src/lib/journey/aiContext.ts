import 'server-only';
import type { EdaIdentity } from '@/lib/eda/identity';
import type { CopilotSource } from '@/lib/ai/copilotKnowledge';
import { projectAttachmentSchema } from './schema';
import { getJourneyRun, getRevision, ownedJourneyProject, verifiedRunArtifact } from './store';
import { parseVcd } from './waveform';

export async function projectAiContext(
  identity: EdaIdentity,
  raw: unknown
): Promise<{ context: string; instruction: string; sources: CopilotSource[] }> {
  const selection = projectAttachmentSchema.parse(raw);
  const project = await ownedJourneyProject(identity, selection.projectId);
  const revision = await getRevision(identity, project.id, selection.revisionId);
  if (!revision) throw new Error('Selected revision not found');
  const execution = selection.runId ? await getJourneyRun(identity, project.id, selection.runId) : undefined;
  if (execution && execution.revisionId !== revision.id)
    throw new Error('Selected run belongs to a different revision');
  if (selection.artifactIds.length && !execution) throw new Error('Select a run before attaching its artifacts');
  const excerpts: Array<{ source: string; content: string; truncated: boolean }> = [];
  const excerpt = (source: string, content: string, limit: number) =>
    excerpts.push({ source, content: content.slice(0, limit), truncated: content.length > limit });
  if (selection.includeRtl) excerpt('design.v', revision.rtl, 10000);
  if (selection.includeConstraints) excerpt('constraint.sdc', revision.sdc, 4000);
  if (selection.includeReport && execution)
    excerpt(
      'verified execution report',
      JSON.stringify({
        status: execution.jobStatus,
        report: execution.report,
        error: execution.reportError ?? execution.error,
      }),
      8000
    );
  for (const id of new Set(selection.artifactIds)) {
    const artifact = execution!.artifacts.find((item) => item.id === id);
    if (!artifact || !/\.(vcd|log|txt|rpt|json|v|sv|sdc|csv)$/i.test(artifact.relativePath))
      throw new Error('Selected artifact is not a supported text or waveform attachment');
    const content = verifiedRunArtifact(identity, execution!.jobId, artifact).toString('utf8');
    if (/\.vcd$/i.test(artifact.relativePath)) {
      const wave = parseVcd(content, { signals: 12, transitions: 100 });
      excerpt(
        artifact.relativePath,
        JSON.stringify({
          ...wave,
          note: 'Bounded waveform excerpt; omitted signals and transitions are not evidence of absence.',
        }),
        2500
      );
    } else excerpt(artifact.relativePath, content, 2500);
  }
  const contextDocument = {
    project: project.name,
    projectId: project.id,
    revision: revision.number,
    revisionId: revision.id,
    sourceHash: revision.sourceHash,
    specification: revision.specification.slice(0, 3000),
    requirements: revision.requirements,
    runId: execution?.id,
    excerpts,
  };
  let context = JSON.stringify(contextDocument);
  while (context.length > 40000) {
    const last = [...excerpts].reverse().find((item) => item.content.length > 0);
    if (!last) throw new Error('Selected specification exceeds the AI context limit');
    last.content = last.content.slice(0, Math.floor(last.content.length / 2));
    last.truncated = true;
    context = JSON.stringify(contextDocument);
  }
  const instruction =
    selection.view === 'learn'
      ? `Use Learn mode, hint level ${selection.hintLevel} of 3. Level 1 explains the concept and asks a targeted question. Level 2 points to the failing construct, requirement or trace. Level 3 may show a small illustrative fragment. Do not provide a complete graded solution. Distinguish observed execution evidence from inference and incomplete excerpts.`
      : 'Use Engineer mode. Cite the supplied revision, named checks and artifact excerpts. Explain the likely cause and how to confirm it. When a code change is requested, propose a small unified diff against the attached source with rationale, affected requirements and rerun commands. The proposal is for human review and has not been applied or executed. Do not invent line numbers, measurements, tool execution or approvals.';
  return {
    context,
    instruction,
    sources: [
      {
        title: `${project.name} · revision ${revision.number}`,
        href: `/workspace/projects/${project.id}`,
        description: 'Selected, authorized project revision and execution evidence.',
      },
    ],
  };
}
