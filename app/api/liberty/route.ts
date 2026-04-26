/**
 * POST /api/liberty — parse a Liberty (.lib) source string.
 *
 * Body: { source: string }
 * Returns: { library, summary }
 */
import { NextRequest, NextResponse } from 'next/server';
import { parseLiberty, summariseLiberty } from '@/lib/parsers/liberty';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  let body: { source?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'invalid JSON' }, { status: 400 }); }

  if (typeof body.source !== 'string') {
    return NextResponse.json({ error: 'missing "source" string' }, { status: 400 });
  }
  const library = parseLiberty(body.source);
  return NextResponse.json({
    library,
    summary: summariseLiberty(library),
  });
}
