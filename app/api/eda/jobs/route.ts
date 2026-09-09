import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireEdaIdentity, requireEdaRole } from '@/lib/eda/identity';
import { createJob, listJobs } from '@/lib/eda/store';

const jobSchema = z.object({
  projectId: z.string().uuid(),
  kind: z.enum(['yosys', 'openroad', 'simulation', 'formal']),
  inputs: z.record(z.string().max(25 * 1024 * 1024)),
  expectedCpuSeconds: z.number().int().positive().max(86_400).optional(),
  retentionDays: z.number().int().positive().max(365).optional(),
});

export async function GET(request: Request) {
  const identity = await requireEdaIdentity(request);
  if (identity instanceof NextResponse) return identity;
  const projectId = new URL(request.url).searchParams.get('projectId') ?? undefined;
  return NextResponse.json({ jobs: listJobs(identity, projectId) });
}

export async function POST(request: Request) {
  const identity = await requireEdaIdentity(request);
  if (identity instanceof NextResponse) return identity;
  const denied = requireEdaRole(identity, ['admin', 'editor']);
  if (denied) return denied;
  const idempotencyKey = request.headers.get('idempotency-key') ?? '';
  try {
    const input = jobSchema.parse(await request.json());
    const job = createJob(identity, { ...input, idempotencyKey });
    return NextResponse.json({ job }, { status: 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'invalid job';
    return NextResponse.json({ error: message }, { status: message.includes('conflicts') ? 409 : 400 });
  }
}
