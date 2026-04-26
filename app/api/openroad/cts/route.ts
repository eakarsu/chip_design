/**
 * POST /api/openroad/cts — parse a CTS / clock-skew report.
 */
import { NextRequest, NextResponse } from 'next/server';
import { parseCtsReport, analyseCts } from '@/lib/tools/cts';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  let body: { stdout?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }
  if (typeof body?.stdout !== 'string' || body.stdout.length === 0) {
    return NextResponse.json({ error: 'missing "stdout" string' }, { status: 400 });
  }
  const report = parseCtsReport(body.stdout);
  const analytics = analyseCts(report);
  // Convert Map → plain object for JSON.
  return NextResponse.json({
    summary: report.summary,
    nodes: report.nodes,
    warnings: report.warnings,
    analytics: {
      latencyBySink: Object.fromEntries(analytics.latencyBySink),
      minLatency: analytics.minLatency,
      maxLatency: analytics.maxLatency,
      computedSkew: analytics.computedSkew,
    },
  });
}
