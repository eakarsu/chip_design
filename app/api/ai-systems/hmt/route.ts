export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { hmtInputSchema, modelHmtMemory } from '@/lib/ai-systems/hmt';
import { modelFailure, readJsonBody, validationFailure } from '../_shared';

export async function POST(request: Request) {
  const parsedBody = await readJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;

  const parsed = hmtInputSchema.safeParse(parsedBody.body);
  if (!parsed.success) return validationFailure(parsed.error);

  try {
    return NextResponse.json(modelHmtMemory(parsed.data));
  } catch (error) {
    return modelFailure('hmt', error);
  }
}
