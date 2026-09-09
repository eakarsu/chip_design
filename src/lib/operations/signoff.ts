import { z } from 'zod';

export const signoffDomainSchema = z.enum(['sta', 'drc', 'lvs', 'ir', 'em', 'antenna', 'cdc']);

// A normalized primary report, retained as the artifact's bytes. Display names
// and arbitrary metadata are never a passing result.
export const signoffReportSchema = z.object({
  schemaVersion: z.literal(1),
  domain: signoffDomainSchema,
  runRef: z.string().trim().min(1).max(200),
  commitSha: z.string().regex(/^[0-9a-f]{7,64}$/i),
  constraintSetId: z.string().uuid(),
  corners: z.array(z.string().trim().min(1)).min(1).max(500),
  tool: z.object({
    product: z.string().trim().min(1),
    version: z.string().trim().min(1),
    licenseRef: z.string().trim().min(1),
  }),
  completedAt: z.string().datetime(),
  checks: z
    .array(
      z.object({
        rule: z.string().trim().min(1),
        scope: z.string().trim().min(1),
        observed: z.number().finite(),
        limit: z.number().finite(),
        comparison: z.enum(['lte', 'gte', 'eq']),
      })
    )
    .min(1)
    .max(10_000),
});

export type SignoffReport = z.infer<typeof signoffReportSchema>;

export function signoffCheckPasses(check: SignoffReport['checks'][number]): boolean {
  return check.comparison === 'lte'
    ? check.observed <= check.limit
    : check.comparison === 'gte'
      ? check.observed >= check.limit
      : check.observed === check.limit;
}

export const waiverPayloadSchema = z
  .object({
    domain: signoffDomainSchema,
    rule: z.string().trim().min(1).max(200),
    scope: z.string().trim().min(1).max(1000),
    rationale: z.string().trim().min(10).max(4000),
  })
  .passthrough();
