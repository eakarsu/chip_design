export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { memoryTechInputSchema, projectMemoryTechnology } from '@/lib/ai-systems/memoryTech';
import { modelFailure, readJsonBody, validationFailure } from '../_shared';

export async function POST(request: Request) {
  const parsedBody = await readJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;

  const parsed = memoryTechInputSchema.safeParse(parsedBody.body);
  if (!parsed.success) return validationFailure(parsed.error);

  try {
    return NextResponse.json(projectMemoryTechnology(parsed.data));
  } catch (error) {
    return modelFailure('memory-tech', error);
  }
}
