import { NextResponse } from 'next/server';
import { unquoteEnvironmentValue } from '@/lib/auth/demo';

export async function GET() {
  const enabled = process.env.ENABLE_DEMO_CREDENTIALS === 'true'
    || process.env.ALLOW_DEMO_SEED === 'true';
  const email = unquoteEnvironmentValue(process.env.DEMO_EMAIL || process.env.ADMIN_EMAIL);
  const password = unquoteEnvironmentValue(process.env.DEMO_PASSWORD || process.env.ADMIN_PASSWORD);

  if (!enabled || !email || !password) {
    return NextResponse.json(
      { error: 'Demo credentials are not enabled for this deployment.' },
      { status: 404 },
    );
  }

  return NextResponse.json(
    { email, password },
    {
      headers: {
        'Cache-Control': 'no-store, private',
        'Pragma': 'no-cache',
      },
    },
  );
}
