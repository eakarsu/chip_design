export const runtime = 'nodejs';

import { z } from 'zod';
import { hlsPost, kernelSummary } from '@/lib/hls/api';
import { parseKernel } from '@/lib/hls/kernel';

const parameterSchema = z.record(z.number().int().min(-1_000_000).max(1_000_000));

const bodySchema = z.object({
  kernel: z.string().min(1).max(200_000),
  parameters: parameterSchema.optional(),
  defaults: parameterSchema.optional(),
}).strict();

/**
 * Parse a restricted C-like kernel into IR. No estimation, synthesis, or
 * verification is performed by this endpoint.
 */
export async function POST(request: Request) {
  return hlsPost(request, bodySchema, (body) => {
    const kernel = parseKernel(body.kernel, {
      parameters: body.parameters,
      defaults: body.defaults,
    });
    return {
      label: kernel.label,
      note: 'parse result only: no estimation, synthesis, simulation, or verification was run',
      irVersion: kernel.irVersion,
      subset: kernel.subset,
      notes: kernel.notes,
      ...kernelSummary(kernel),
    };
  });
}
