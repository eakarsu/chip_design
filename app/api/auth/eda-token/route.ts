import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/middleware/auth';
import { issueEdaToken } from '@/lib/eda/token';
import type { EdaRole } from '@/lib/eda/identity';

export const dynamic = 'force-dynamic';

function role(value: string): EdaRole {
  if (value === 'admin' || value === 'editor' || value === 'viewer') return value;
  return 'viewer';
}

export async function POST(request: Request) {
  const authenticated = await requireAuth(request);
  if (authenticated instanceof NextResponse) return authenticated;
  try {
    const issued = issueEdaToken({
      tenantId: authenticated.user.tenantId ?? 'local',
      userId: authenticated.user.id,
      role: role(authenticated.user.role),
      email: authenticated.user.email,
    });
    return NextResponse.json(issued, {
      headers: {
        'Cache-Control': 'no-store, private',
        Pragma: 'no-cache',
      },
    });
  } catch (error) {
    return NextResponse.json({
      error: 'EDA identity exchange unavailable',
      message: error instanceof Error ? error.message : 'identity configuration is invalid',
    }, { status: 503 });
  }
}
