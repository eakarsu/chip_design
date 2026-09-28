export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import {
  ANALYTICAL_ESTIMATE_LABEL,
  ESTIMATE_DISCLAIMER,
} from '@/lib/ai-systems/common';
import {
  compareQuantizationSchemes,
  exploreQuantization,
  quantizationBaseInputSchema,
  quantizationInputSchema,
} from '@/lib/ai-systems/quantization';
import { modelFailure, readJsonBody, validationFailure } from '../_shared';

export async function POST(request: Request) {
  const parsedBody = await readJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;

  const body = parsedBody.body;
  const hasScheme =
    typeof body === 'object' && body !== null && 'scheme' in (body as Record<string, unknown>);

  // No scheme supplied: return the four-scheme comparison sweep.
  if (!hasScheme) {
    const base = quantizationBaseInputSchema.safeParse(body);
    if (!base.success) return validationFailure(base.error);
    try {
      return NextResponse.json({
        label: ANALYTICAL_ESTIMATE_LABEL,
        disclaimer: ESTIMATE_DISCLAIMER,
        mode: 'comparison',
        schemes: compareQuantizationSchemes(base.data),
        assumptions: [
          'Comparison rows use the same traffic and energy formulas as the single-scheme explorer.',
          'Weight footprint includes vector-quantization codebook bytes; activation footprint includes metadata overhead.',
        ],
        limitations: [
          'Quality degradation is not modeled unless calibration points are supplied; see each row\u2019s quality field.',
          'Rows are deterministic analytical estimates, not measurements.',
        ],
      });
    } catch (error) {
      return modelFailure('quantization', error);
    }
  }

  const parsed = quantizationInputSchema.safeParse(body);
  if (!parsed.success) return validationFailure(parsed.error);

  try {
    return NextResponse.json(exploreQuantization(parsed.data));
  } catch (error) {
    return modelFailure('quantization', error);
  }
}
