import { z } from 'zod';
import { workspaceOperation } from '@/lib/commercial/http';
import { journeyBody } from '@/lib/journey/http';
import { importDesignSearchSource } from '@/lib/journey/store';

export const runtime = 'nodejs';

const importSchema = z.object({
  name: z.string().trim().min(2).max(120),
  topModule: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]{0,100}$/),
  specification: z.string().trim().min(10).max(16_000),
  rtl: z.string().min(100).max(16_000),
  sdc: z.string().min(10).max(40_000),
  testbench: z.string().min(10).max(100_000),
  properties: z.string().min(10).max(60_000),
}).strict();

export async function POST(request: Request) {
  return workspaceOperation(request, 'design-search.import', async (identity, requestId) => ({
    revision: await importDesignSearchSource(identity, importSchema.parse(await journeyBody(request)), requestId),
  }), ['admin', 'editor']);
}
