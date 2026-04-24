/**
 * Algorithm leaderboard.
 *
 * Reads persisted runs from the `algorithmRuns` table and ranks them by a
 * caller-chosen metric. The default metric is `runtimeMs` ascending (fastest
 * first) — useful as a regression canary. Callers can also rank by any
 * numeric field under `result` (e.g. `wirelength`, `wns`) or `result.metrics.*`
 * via `?metric=`; we walk the dotted path and coerce values to numbers.
 *
 * Query params:
 *   - category: filter to a single category (placement, routing, ...)
 *   - metric: dotted path under the run object. Default "runtimeMs".
 *   - order:  "asc" (default) or "desc".
 *   - limit:  max rows returned. Capped at 100.
 *   - onlySuccess: "1" to drop failed runs (default: include all).
 */

import { NextRequest, NextResponse } from 'next/server';
import { algorithmRuns, type AlgorithmRun } from '@/lib/db';

function pickPath(obj: any, path: string): unknown {
  return path.split('.').reduce<any>((acc, k) => (acc == null ? acc : acc[k]), obj);
}

function numericOrNull(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return null;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const category = url.searchParams.get('category');
  const metric = url.searchParams.get('metric') ?? 'runtimeMs';
  const order = url.searchParams.get('order') === 'desc' ? 'desc' : 'asc';
  const onlySuccess = url.searchParams.get('onlySuccess') === '1';
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') ?? '20', 10)));

  try {
    let rows: AlgorithmRun[] = algorithmRuns.list();
    if (category) rows = rows.filter(r => r.category === category);
    if (onlySuccess) rows = rows.filter(r => r.success);

    // Attach the metric value while preserving the full row so the client
    // can show secondary context. Runs that don't expose the metric are
    // excluded from ranking (they'd otherwise cluster at one extreme of
    // the sort and muddy the leaderboard).
    const scored = rows
      .map(r => {
        const raw = metric === 'runtimeMs'
          ? r.runtimeMs
          : pickPath(r, metric) ?? pickPath(r.result, metric);
        return { run: r, score: numericOrNull(raw) };
      })
      .filter((x): x is { run: AlgorithmRun; score: number } => x.score !== null);

    scored.sort((a, b) => order === 'asc' ? a.score - b.score : b.score - a.score);

    const top = scored.slice(0, limit).map((x, i) => ({
      rank: i + 1,
      id: x.run.id,
      category: x.run.category,
      algorithm: x.run.algorithm,
      score: x.score,
      runtimeMs: x.run.runtimeMs,
      success: x.run.success,
      createdAt: x.run.createdAt,
    }));

    return NextResponse.json({
      metric,
      order,
      category: category ?? null,
      total: scored.length,
      onlySuccess,
      entries: top,
    });
  } catch (e) {
    return NextResponse.json(
      { error: 'Leaderboard failed', message: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
