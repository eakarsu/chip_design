export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import { requirementsSchema, type BuckDesign } from '@/lib/analog/types';
import { buildTransientDeck } from '@/lib/analog/netlist';
import { exportBomCsv, exportWiringList, renderSchematicSvg } from '@/lib/analog/schematic';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const requirements = requirementsSchema.parse(body.requirements);
    const design = body.design as BuckDesign;
    if (!design?.ic) throw new Error('A design object is required');
    const deck = buildTransientDeck({ requirements, design });
    return NextResponse.json({
      svg: renderSchematicSvg(requirements, design),
      bomCsv: exportBomCsv(design),
      wiringCsv: exportWiringList(requirements, design),
      netlist: deck.deck,
      notes: [
        ...deck.notes,
        'EasyEDA/PSpice automation is not available here; these exports are calculated design artifacts for review, not vendor-tool output.',
      ],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Schematic generation failed';
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
