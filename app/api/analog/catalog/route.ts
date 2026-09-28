export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import { BUCK_ICS, CAPACITORS, DIODES, INDUCTORS } from '@/lib/analog/catalog';
import { simulatorAvailability } from '@/lib/analog/simulation';

export async function GET() {
  return NextResponse.json({
    ics: BUCK_ICS,
    inductors: INDUCTORS,
    capacitors: CAPACITORS,
    diodes: DIODES,
    simulator: simulatorAvailability(),
    note: 'Curated datasheet snapshot. Re-verify every value against the current vendor datasheet before ordering hardware.',
  });
}
