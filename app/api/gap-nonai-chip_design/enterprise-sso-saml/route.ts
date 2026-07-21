import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json(
    { error: 'Generated gap endpoint is quarantined; use production OIDC.' },
    { status: 410 },
  );
}
