import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/middleware/auth';
import { handleApiError } from '@/lib/middleware/errorHandler';
import { masteryForUser } from '@/lib/academy/mastery';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const guard = await requireAuth(request);
  if (guard instanceof NextResponse) return guard;
  try {
    const mastery = await masteryForUser({ tenantId: guard.user.tenantId ?? 'local', userId: guard.user.id });
    return NextResponse.json(mastery, { headers: { 'Cache-Control': 'no-store, private' } });
  } catch (error) {
    return handleApiError(error);
  }
}
