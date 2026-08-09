import { z } from 'zod';

export const adapterResultSchema = z.object({
  runRef: z.string().trim().min(1).max(200),
  tool: z.object({
    vendor: z.string().trim().min(1).max(100),
    product: z.string().trim().min(1).max(100),
    version: z.string().trim().min(1).max(100),
    imageDigest: z
      .string()
      .regex(/^[0-9a-f]{64}$/)
      .optional(),
    licenseRef: z.string().trim().min(1).max(300),
  }),
  metrics: z.record(z.number().finite()),
  reports: z
    .array(
      z.object({
        kind: z.string().trim().min(1).max(80),
        uri: z.string().trim().min(1).max(1000),
        sha256: z.string().regex(/^[0-9a-f]{64}$/),
        signature: z.string().trim().max(2000).optional(),
      })
    )
    .min(1)
    .max(500),
  corners: z.array(z.string().trim().min(1).max(160)).max(500),
  completedAt: z.string().datetime(),
});

export type AdapterResult = z.infer<typeof adapterResultSchema>;

export interface CommercialToolAdapter<TInput = Record<string, unknown>> {
  readonly id: string;
  readonly displayName: string;
  validateInput(input: unknown): TInput;
  submit(input: TInput, signal?: AbortSignal): Promise<{ externalRunId: string }>;
  poll(externalRunId: string, signal?: AbortSignal): Promise<'queued' | 'running' | 'succeeded' | 'failed'>;
  collect(externalRunId: string, signal?: AbortSignal): Promise<AdapterResult>;
}

export function normalizeAdapterResult(input: unknown): AdapterResult {
  const result = adapterResultSchema.parse(input);
  return {
    ...result,
    metrics: Object.fromEntries(Object.entries(result.metrics).sort(([left], [right]) => left.localeCompare(right))),
    reports: [...result.reports].sort((left, right) => left.kind.localeCompare(right.kind)),
    corners: [...new Set(result.corners)].sort(),
  };
}
