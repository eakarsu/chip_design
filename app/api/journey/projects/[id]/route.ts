import { z } from 'zod';
import { workspaceOperation } from '@/lib/commercial/http';
import { journeyBody } from '@/lib/journey/http';
import { revisionSchema } from '@/lib/journey/schema';
import {
  gradeJourneyRun,
  journeyBundle,
  launchJourneyRun,
  reviewExplanation,
  saveRevision,
  startChallenge,
} from '@/lib/journey/store';
import { hardwareChecklist, importHardwareMeasurements, saveHardwareStep } from '@/lib/journey/hardware';

export const runtime = 'nodejs';
type Context = { params: Promise<{ id: string }> };
const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('save'), revision: revisionSchema }).strict(),
  z
    .object({ action: z.literal('challenge'), challengeId: z.string().max(80), baseRevisionId: z.string().uuid() })
    .strict(),
  z
    .object({
      action: z.literal('run'),
      revisionId: z.string().uuid(),
      kind: z.enum(['simulation', 'formal', 'yosys', 'openroad']),
      purpose: z.enum(['lab', 'regression']),
      idempotencyKey: z.string().regex(/^[a-zA-Z0-9._:-]{8,128}$/),
    })
    .strict(),
  z
    .object({ action: z.literal('grade'), runId: z.string().uuid(), explanation: z.string().trim().min(20).max(12000) })
    .strict(),
  z
    .object({
      action: z.literal('review'),
      assessmentId: z.string().uuid(),
      score: z.number().int().min(0).max(15),
      feedback: z.string().trim().min(20).max(4000),
    })
    .strict(),
  z.object({ action: z.literal('measurements'), content: z.string().max(1000000) }).strict(),
  z
    .object({
      action: z.literal('checklist'),
      revisionId: z.string().uuid(),
      stepId: z.string().max(80),
      evidenceArtifactId: z.string().uuid(),
      notes: z.string().trim().min(20).max(4000),
    })
    .strict(),
]);

export async function GET(request: Request, context: Context) {
  const { id } = await context.params;
  return workspaceOperation(request, 'journey.project.read', async (identity) => {
    const bundle = await journeyBundle(identity, id);
    return { ...bundle, checklist: bundle.revision ? await hardwareChecklist(identity, id, bundle.revision.id) : [] };
  });
}

export async function POST(request: Request, context: Context) {
  const { id } = await context.params;
  return workspaceOperation(
    request,
    'journey.project.update',
    async (identity, requestId) => {
      const input = schema.parse(await journeyBody(request));
      switch (input.action) {
        case 'save':
          return { revision: await saveRevision(identity, id, input.revision, requestId) };
        case 'challenge':
          return { revision: await startChallenge(identity, id, input.challengeId, input.baseRevisionId, requestId) };
        case 'run':
          return { run: await launchJourneyRun(identity, id, input, requestId) };
        case 'grade':
          return { assessment: await gradeJourneyRun(identity, id, input.runId, input.explanation, requestId) };
        case 'review':
          return {
            assessment: await reviewExplanation(
              identity,
              id,
              input.assessmentId,
              input.score,
              input.feedback,
              requestId
            ),
          };
        case 'measurements':
          return { measurements: await importHardwareMeasurements(identity, id, input.content, requestId) };
        case 'checklist':
          return { step: await saveHardwareStep(identity, id, input, requestId) };
      }
    },
    ['admin', 'editor']
  );
}
