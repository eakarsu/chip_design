import { NextResponse } from 'next/server';
import { requireEdaIdentity, requireEdaRole } from '@/lib/eda/identity';
import { approveJob } from '@/lib/eda/store';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const identity = await requireEdaIdentity(request);
  if (identity instanceof NextResponse) return identity;
  const denied = requireEdaRole(identity, ['admin']);
  if (denied) return denied;
  try {
    return NextResponse.json({ job: approveJob(identity, id) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'approval failed' }, { status: 409 });
  }
}
