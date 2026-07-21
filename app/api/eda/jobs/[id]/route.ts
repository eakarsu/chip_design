import { NextResponse } from 'next/server';
import { requireEdaIdentity } from '@/lib/eda/identity';
import { getJob, requestCancellation } from '@/lib/eda/store';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const identity = await requireEdaIdentity(request);
  if (identity instanceof NextResponse) return identity;
  const job = getJob(identity, id);
  return job
    ? NextResponse.json({ job })
    : NextResponse.json({ error: 'Not found' }, { status: 404 });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const identity = await requireEdaIdentity(request);
  if (identity instanceof NextResponse) return identity;
  try {
    return NextResponse.json({ job: requestCancellation(identity, id) });
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
}
