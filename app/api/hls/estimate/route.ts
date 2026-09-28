export const runtime = 'nodejs';

import { z } from 'zod';
import { hlsPost } from '@/lib/hls/api';
import { parseKernel } from '@/lib/hls/kernel';
import { normalizeDesignPoint } from '@/lib/hls/pragmas';
import { estimateDesignPoint } from '@/lib/hls/estimator';

const parameterSchema = z.record(z.number().int().min(-1_000_000).max(1_000_000));

const loopPragmaSchema = z.object({
  loopId: z.string().min(1).max(64),
  parallelFactor: z.number().int().min(1).max(64).optional(),
  pipelineII: z.number().int().min(1).max(64).optional(),
  unrollFactor: z.number().int().min(1).max(64).optional(),
  tileFactor: z.number().int().min(1).max(64).optional(),
}).strict();

const bodySchema = z.object({
  kernel: z.string().min(1).max(200_000),
  parameters: parameterSchema.optional(),
  defaults: parameterSchema.optional(),
  /** Per-loop pragmas; omitted loops default to the identity pragma. */
  designPoint: z.array(loopPragmaSchema).max(64).optional(),
}).strict();

/** Estimate one design point with the analytical cost model. */
export async function POST(request: Request) {
  return hlsPost(request, bodySchema, (body) => {
    const kernel = parseKernel(body.kernel, {
      parameters: body.parameters,
      defaults: body.defaults,
    });
    const point = normalizeDesignPoint(kernel, body.designPoint);
    const estimate = estimateDesignPoint(kernel, point);
    return {
      designPoint: { id: point.id, pragmaKey: point.pragmaKey, loopPragmas: point.loopPragmas, directives: point.directives },
      estimate,
      note: 'analytical estimate only: no synthesis, scheduling, binding, simulation, or timing analysis was run',
    };
  });
}
