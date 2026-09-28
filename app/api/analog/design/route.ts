export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import { BUCK_ICS } from '@/lib/analog/catalog';
import { designBuck } from '@/lib/analog/design';
import { requirementsSchema, icCandidateSchema } from '@/lib/analog/types';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const requirements = requirementsSchema.parse(body.requirements ?? body);
    const ic = body.ic
      ? icCandidateSchema.parse(body.ic)
      : BUCK_ICS.find((entry) => entry.part === body.icPart) ?? null;
    if (!ic) return NextResponse.json({ error: `Unknown IC: ${body.icPart ?? '(none)'}` }, { status: 404 });
    const design = designBuck(requirements, ic, body.options ?? {});
    return NextResponse.json({ requirements, ic, design });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Design failed';
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
