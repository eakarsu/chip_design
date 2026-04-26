/**
 * POST /api/xsection — extract a vertical cross-section through a layer stack.
 *
 * Body: XSectionRequest = { stack, rects, axis, at, windowMin?, windowMax? }
 * Returns: XSectionResult
 */
import { NextRequest, NextResponse } from 'next/server';
import { extractXSection, type XSectionRequest } from '@/lib/tools/xsection';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  let body: Partial<XSectionRequest>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'invalid JSON' }, { status: 400 }); }

  if (!Array.isArray(body.stack) || !Array.isArray(body.rects) ||
      typeof body.at !== 'number' ||
      (body.axis !== 'x' && body.axis !== 'y')) {
    return NextResponse.json(
      { error: 'missing or invalid {stack, rects, axis, at}' },
      { status: 400 });
  }
  try {
    return NextResponse.json(extractXSection(body as XSectionRequest));
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) }, { status: 422 });
  }
}
