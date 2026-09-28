export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { lutInferenceInputSchema, modelLutDotProduct } from '@/lib/ai-systems/lutInference';
import { modelFailure, readJsonBody, validationFailure } from '../_shared';

export async function POST(request: Request) {
  const parsedBody = await readJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;

  const parsed = lutInferenceInputSchema.safeParse(parsedBody.body);
  if (!parsed.success) return validationFailure(parsed.error);

  try {
    return NextResponse.json(modelLutDotProduct(parsed.data));
  } catch (error) {
    return modelFailure('lut', error);
  }
}
