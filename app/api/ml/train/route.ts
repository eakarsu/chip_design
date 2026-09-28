/**
 * POST /api/ml/train — train a ridge surrogate from stored OpenLane runs.
 *
 * Governance: workspace roles `admin` | `editor` (checked twice — an explicit
 * identity check so malformed bodies can answer with a readable 422, then the
 * governed `workspaceOperation` that performs the audited mutation).
 *
 * Responses:
 *   200 model + training metrics + persisted sample count
 *   400 unknown target / no usable samples (message lists targets and columns)
 *   401/403 unauthenticated or insufficient role
 *   422 body failed schema validation (details included)
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { workspaceIdentity, workspaceOperation } from '@/lib/commercial/http';
import { MIN_TRAINING_SAMPLES } from '@/lib/ml/surrogate';
import { ML_TARGETS, trainFromRuns } from '@/lib/ml/trainFromRuns';

export const runtime = 'nodejs';

const optionsSchema = z.object({
  learningRate: z.number().positive().max(1).optional(),
  l2: z.number().min(0).max(10).optional(),
  epochs: z.number().int().min(1).max(100_000).optional(),
  tolerance: z.number().positive().max(1).optional(),
  seed: z.number().int().min(0).max(2 ** 31 - 1).optional(),
  name: z.string().trim().min(1).max(120).optional(),
}).strict();

const bodySchema = z.object({
  target: z.string().trim().min(1).max(64),
  options: optionsSchema.optional(),
}).strict();

export async function POST(request: Request) {
  const identity = await workspaceIdentity(request, ['admin', 'editor']);
  if (identity instanceof NextResponse) return identity;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid request', message: 'Request body must be valid JSON' },
      { status: 422 },
    );
  }

  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'Invalid request',
        message: 'Training request failed validation',
        details: parsed.error.flatten(),
        availableTargets: ML_TARGETS.map(definition => definition.target),
      },
      { status: 422 },
    );
  }

  return workspaceOperation(request, 'ml.train', async () => {
    const result = trainFromRuns({
      target: parsed.data.target,
      options: parsed.data.options,
      createdBy: identity.userId,
    });
    return {
      model: {
        id: result.model.id,
        name: result.model.name,
        target: result.model.target,
        featureNames: result.model.featureNames,
        weights: result.model.weights,
        intercept: result.model.intercept,
        featureMeans: result.model.featureMeans,
        featureStds: result.model.featureStds,
        residualStd: result.model.residualStd,
        sampleCount: result.model.sampleCount,
        source: result.model.source,
        createdAt: result.model.createdAt,
      },
      metrics: result.model.metrics,
      hyperparameters: result.model.hyperparameters,
      insufficientData: result.insufficientData,
      minTrainingSamples: MIN_TRAINING_SAMPLES,
      sampleCount: result.sampleCount,
      runsConsidered: result.runsConsidered,
      runsSkipped: result.runsSkipped,
      availableTargets: result.availableTargets.map(target => ({
        target: target.target,
        sampleCount: target.sampleCount,
        available: target.available,
      })),
    };
  }, ['admin', 'editor']);
}
