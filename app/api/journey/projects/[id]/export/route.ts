import { NextResponse } from 'next/server';
import { z } from 'zod';
import { workspaceIdentity } from '@/lib/commercial/http';
import { exportJourney } from '@/lib/journey/hardware';

export const runtime = 'nodejs';
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const identity = await workspaceIdentity(request);
  if (identity instanceof NextResponse) return identity;
  const { id } = await context.params;
  try {
    const query = new URL(request.url).searchParams;
    const revisionId = z.string().uuid().parse(query.get('revisionId'));
    const target = z.enum(['engineering', 'tinytapeout']).parse(query.get('target') || 'engineering');
    const archive = await exportJourney(identity, id, revisionId, target);
    return new NextResponse(new Uint8Array(archive), {
      headers: {
        'Content-Type': 'application/gzip',
        'Content-Disposition': `attachment; filename="chip-${target}-${revisionId}.tar.gz"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : 'Export failed' }, { status: 400 });
  }
}
