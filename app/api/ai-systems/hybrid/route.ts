export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { hybridPipelineInputSchema, planHybridPipeline } from '@/lib/ai-systems/hybrid';
import { modelFailure, readJsonBody, validationFailure } from '../_shared';

export async function POST(request: Request) {
  const parsedBody = await readJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;

  const parsed = hybridPipelineInputSchema.safeParse(parsedBody.body);
  if (!parsed.success) return validationFailure(parsed.error);

  try {
    return NextResponse.json(planHybridPipeline(parsed.data));
  } catch (error) {
    return modelFailure('hybrid', error);
  }
}
