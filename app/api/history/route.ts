/**
 * Algorithm run history endpoint.
 *
 * Lists past algorithm executions persisted by the /api/algorithms POST.
 * Optional `?designId=` filters to a single design.
 */

import { NextRequest, NextResponse } from 'next/server';
import { algorithmRuns } from '@/lib/db';
import { requireAuth } from '@/lib/middleware/auth';

export async function GET(request: NextRequest) {
  const guard = await requireAuth(request);
  if (guard instanceof NextResponse) return guard;

  const url = new URL(request.url);
  const designId = url.searchParams.get('designId');
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '200', 10), 1000);

  try {
    const rows = designId ? algorithmRuns.byDesign(designId) : algorithmRuns.list();
    const sorted = rows
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
    return NextResponse.json({ runs: sorted, total: rows.length });
  } catch (e) {
    return NextResponse.json(
      { error: 'Failed to load history', message: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
