export const runtime = 'nodejs';

import { z } from 'zod';
import { hlsPost } from '@/lib/hls/api';
import { parseKernel } from '@/lib/hls/kernel';
import { exploreDesignSpace } from '@/lib/hls/pragmas';

const parameterSchema = z.record(z.number().int().min(-1_000_000).max(1_000_000));

const factorList = z.array(z.number().int().min(1).max(64)).min(1).max(64);

const optionsSchema = z.object({
  parallelFactors: factorList.optional(),
  pipelineIIs: factorList.optional(),
  unrollFactors: factorList.optional(),
  tileFactors: factorList.optional(),
  maxPoints: z.number().int().min(1).max(5000).optional(),
}).strict();

const weightsSchema = z.object({
  latency: z.number().min(0).max(1000).optional(),
  area: z.number().min(0).max(1000).optional(),
  memory: z.number().min(0).max(1000).optional(),
  power: z.number().min(0).max(1000).optional(),
}).strict();

const bodySchema = z.object({
  kernel: z.string().min(1).max(200_000),
  parameters: parameterSchema.optional(),
  defaults: parameterSchema.optional(),
  options: optionsSchema.optional(),
  weights: weightsSchema.optional(),
  limit: z.number().int().min(1).max(200).optional(),
}).strict();

/**
 * Enumerate and rank the bounded pragma design space for a kernel. Every
 * estimate in the response comes from the analytical estimator, and the
 * ranking is not synthesis evidence.
 */
export async function POST(request: Request) {
  return hlsPost(request, bodySchema, (body) => {
    const kernel = parseKernel(body.kernel, {
      parameters: body.parameters,
      defaults: body.defaults,
    });
    const { space, ranked } = exploreDesignSpace(kernel, body.options, body.weights);
    const limit = body.limit ?? 20;
    const truncatedToLimit = ranked.length > limit;

    return {
      label: space.label,
      note: 'estimates are analytical, not synthesis evidence; the pragma vocabulary belongs to this workspace and is not consumed by a commercial HLS tool',
      designSpace: {
        kernel: space.kernel,
        options: space.options,
        totalCombinations: space.totalCombinations,
        totalCombinationsCapped: space.totalCombinationsCapped,
        sampled: space.sampled,
        samplingStride: space.samplingStride,
        returned: space.returned,
        truncatedToLimit,
        notes: space.notes,
      },
      totalRanked: ranked.length,
      ranked: ranked.slice(0, limit).map((entry) => ({
        id: entry.id,
        index: entry.index,
        rank: entry.rank,
        pareto: entry.pareto,
        weightedScore: Math.round(entry.weightedScore * 1e6) / 1e6,
        dominates: entry.dominates,
        dominatedBy: entry.dominatedBy,
        pragmaKey: entry.pragmaKey,
        loopPragmas: entry.loopPragmas,
        directives: entry.directives,
        estimate: {
          label: entry.estimate.label,
          latencyCycles: entry.estimate.latencyCycles,
          resources: entry.estimate.resources,
          memoryTrafficBytes: entry.estimate.memoryTrafficBytes,
          scores: entry.estimate.scores,
        },
      })),
    };
  });
}
