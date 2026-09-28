export const runtime = 'nodejs';

import { z } from 'zod';
import { hlsPost } from '@/lib/hls/api';
import { parseKernel } from '@/lib/hls/kernel';
import { normalizeDesignPoint } from '@/lib/hls/pragmas';
import { generateScaffold, verifyScaffold, type GeneratedScaffold } from '@/lib/hls/rtl';

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
  designPoint: z.array(loopPragmaSchema).max(64).optional(),
  moduleName: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/).min(1).max(64).optional(),
  /** Run the available host tools (yosys check, iverilog smoke run). Default true outside production. */
  verify: z.boolean().optional(),
  maxCopiesPerLoop: z.number().int().min(1).max(16).optional(),
  maxStates: z.number().int().min(16).max(4096).optional(),
  maxOpInstances: z.number().int().min(1).max(20_000).optional(),
}).strict();

/**
 * Generate the Verilog scaffold for one design point and, unless disabled,
 * run the available host tools. Neither step is functional verification.
 */
export async function POST(request: Request) {
  return hlsPost(request, bodySchema, async (body) => {
    const kernel = parseKernel(body.kernel, {
      parameters: body.parameters,
      defaults: body.defaults,
    });
    const point = normalizeDesignPoint(kernel, body.designPoint);
    const scaffold: GeneratedScaffold = generateScaffold(kernel, point, {
      moduleName: body.moduleName,
      maxCopiesPerLoop: body.maxCopiesPerLoop,
      maxStates: body.maxStates,
      maxOpInstances: body.maxOpInstances,
    });

    const verification = body.verify === false
      ? {
        performed: false,
        note: 'verification was disabled by the request; the scaffold is unverified text',
        yosys: null,
        iverilog: null,
      }
      : { performed: true, ...(await verifyScaffold(scaffold)) };

    return {
      label: scaffold.label,
      note: 'generated scaffold only: it has not been proven equivalent to the source kernel; tool runs above are check/smoke results, not functional verification',
      top: scaffold.top,
      testbenchName: scaffold.testbenchName,
      designPoint: scaffold.designPoint,
      limits: scaffold.limits,
      notes: scaffold.notes,
      verilog: scaffold.verilog,
      testbench: scaffold.testbench,
      verification,
    };
  });
}
