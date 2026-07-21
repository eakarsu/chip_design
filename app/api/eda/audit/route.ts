import { NextResponse } from 'next/server';
import { requireEdaIdentity } from '@/lib/eda/identity';
import { listAudit, verifyAuditChain } from '@/lib/eda/store';

export async function GET(request: Request) {
  const identity = await requireEdaIdentity(request);
  if (identity instanceof NextResponse) return identity;
  return NextResponse.json({ validChain: verifyAuditChain(identity), events: listAudit(identity) });
}
