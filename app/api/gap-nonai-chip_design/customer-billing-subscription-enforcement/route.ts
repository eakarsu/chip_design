import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json(
    { error: 'Generated gap endpoint is quarantined; use a governed domain service.' },
    { status: 410 },
  );
}
