export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import { requirementsSchema, icCandidateSchema, type BuckDesign } from '@/lib/analog/types';
import { designBuck } from '@/lib/analog/design';
import { runAcSimulation, runTransientSimulation, simulatorAvailability, tuneCompensator, withCompensation } from '@/lib/analog/simulation';

const designSchemaShape = (value: unknown): BuckDesign => {
  const design = value as BuckDesign;
  if (!design || typeof design !== 'object' || !design.ic || !design.compensation || !design.billOfMaterials)
    throw new Error('A design object from /api/analog/design is required');
  return design;
};

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const requirements = requirementsSchema.parse(body.requirements);
    let design = designSchemaShape(body.design);
    const simulator = simulatorAvailability();
    if (!simulator.available) {
      return NextResponse.json(
        { error: simulator.reason, simulator, design },
        { status: 503 },
      );
    }
    let tuning = null;
    if (body.tune !== false) {
      tuning = tuneCompensator(requirements, design, { targetCrossoverHz: body.targetCrossoverHz });
      if (tuning.compensator) design = withCompensation(design, tuning.compensator);
    }
    const transient = runTransientSimulation(requirements, design, { tstop: body.tstop, stepAt: body.stepAt });
    const ac = runAcSimulation(requirements, design);
    return NextResponse.json({ simulator, tuning, design, transient, ac });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Simulation failed';
    return NextResponse.json({ error: message }, { status: 422 });
  }
}

export async function GET() {
  return NextResponse.json({ simulator: simulatorAvailability() });
}
