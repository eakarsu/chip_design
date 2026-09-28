/**
 * GET /api/ml/status — what the surrogate pipeline currently knows.
 *
 * Read-only. Reports how many training samples exist per target across the
 * stored OpenLane runs, which targets are actually available, what has been
 * persisted to `ml_samples`, and the stored models with their training
 * metrics.
 */

import { NextResponse } from 'next/server';
import { MIN_TRAINING_SAMPLES } from '@/lib/ml/surrogate';
import { countSamples, listModels } from '@/lib/ml/store';
import { availableTargets } from '@/lib/ml/trainFromRuns';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const targets = availableTargets();
    const samples = countSamples();
    const models = listModels().map(model => ({
      id: model.id,
      name: model.name,
      target: model.target,
      source: model.source,
      sampleCount: model.sampleCount,
      r2: model.metrics.r2,
      rmse: model.metrics.rmse,
      residualStd: model.residualStd,
      insufficientData: model.sampleCount < MIN_TRAINING_SAMPLES,
      createdBy: model.createdBy,
      createdAt: model.createdAt,
    }));

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      minTrainingSamples: MIN_TRAINING_SAMPLES,
      targets: targets.map(target => ({
        target: target.target,
        label: target.label,
        description: target.description,
        metricKeys: target.metricKeys,
        sampleCount: target.sampleCount,
        available: target.available,
      })),
      samples,
      models,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to read ML status',
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
