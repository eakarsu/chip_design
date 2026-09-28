/**
 * POST /api/ml/predict — score a design/run configuration with a trained
 * surrogate. Plain endpoint (no workspace mutation).
 *
 * Body: `{ modelId }` or `{ target }`, plus `config` and optionally the
 * `metrics` / `layout` snapshots used for feature fallbacks.
 *
 * Responses:
 *   200 prediction + uncertainty + insufficientData flag + feature vector
 *   404 no model stored for the requested id/target
 *   422 body failed schema validation (details included)
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { extractFeatures, predict } from '@/lib/ml/surrogate';
import { latestModelForTarget, loadModel } from '@/lib/ml/store';

export const runtime = 'nodejs';

const layoutSchema = z.object({
  chipWidth: z.number().optional(),
  chipHeight: z.number().optional(),
  cells: z.array(z.unknown()).optional(),
}).strict();

const bodySchema = z.object({
  modelId: z.string().trim().min(1).max(128).optional(),
  target: z.string().trim().min(1).max(64).optional(),
  config: z.record(z.unknown()).default({}),
  metrics: z.record(z.unknown()).optional(),
  layout: layoutSchema.optional(),
}).strict().refine(
  body => Number(body.modelId !== undefined) + Number(body.target !== undefined) === 1,
  { message: 'Provide exactly one of modelId or target' },
);

export async function POST(request: Request) {
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
        message: 'Prediction request failed validation',
        details: parsed.error.flatten(),
      },
      { status: 422 },
    );
  }

  const { modelId, target, config, metrics, layout } = parsed.data;
  const model = modelId ? loadModel(modelId) : latestModelForTarget(target ?? '');
  if (!model) {
    return NextResponse.json(
      {
        error: 'Model not found',
        message: modelId
          ? `No stored ML model with id "${modelId}"`
          : `No stored ML model for target "${target}"; train one via POST /api/ml/train first`,
      },
      { status: 404 },
    );
  }

  try {
    const features = extractFeatures({ config, metrics, layout });
    const prediction = predict(model, features);
    return NextResponse.json({
      model: {
        id: model.id,
        name: model.name,
        target: model.target,
        sampleCount: model.sampleCount,
        trainedAt: model.createdAt,
      },
      prediction,
      features,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Prediction failed',
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
