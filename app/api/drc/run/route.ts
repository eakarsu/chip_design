/**
 * Runs a DRC rule deck against a flat list of geometries and returns a
 * report. The deck is JSON validated through `parseRuleDeck`, so an editor
 * UI can POST raw JSON it just round-tripped from `serializeRuleDeck`.
 */
import { NextRequest, NextResponse } from 'next/server';
import {
  parseRuleDeck, runDrc,
  type Geometry, type RuleDeck,
} from '@/lib/algorithms/drc_ruledeck';

export const runtime = 'nodejs';

interface RunRequest {
  deck: RuleDeck | string;
  geometries: Geometry[];
}

export async function POST(req: NextRequest) {
  let body: RunRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }

  if (!body || !body.deck) {
    return NextResponse.json({ error: 'missing "deck"' }, { status: 400 });
  }
  if (!Array.isArray(body.geometries)) {
    return NextResponse.json({ error: 'missing "geometries" array' }, { status: 400 });
  }

  let deck: RuleDeck;
  try {
    deck = parseRuleDeck(body.deck as string | object);
  } catch (e) {
    return NextResponse.json({ error: `bad rule deck: ${(e as Error).message}` }, { status: 400 });
  }

  const report = runDrc(deck, body.geometries);
  return NextResponse.json(report);
}
