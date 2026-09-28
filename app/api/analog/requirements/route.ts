export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import { reviewRequirements } from '@/lib/analog/requirements';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    return NextResponse.json(reviewRequirements(body));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Requirement review failed';
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
