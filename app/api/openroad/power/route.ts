/**
 * POST /api/openroad/power — parse `report_power` stdout into structured
 * groups + per-instance results.
 */
import { NextRequest, NextResponse } from 'next/server';
import { parsePowerReport, groupByCell } from '@/lib/tools/power';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  let body: { stdout?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'invalid JSON' }, { status: 400 }); }
  if (typeof body?.stdout !== 'string' || body.stdout.length === 0) {
    return NextResponse.json({ error: 'missing "stdout" string' }, { status: 400 });
  }
  const report = parsePowerReport(body.stdout);
  return NextResponse.json({
    ...report,
    byCell: groupByCell(report.instances),
  });
}
