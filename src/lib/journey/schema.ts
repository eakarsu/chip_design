import { z } from 'zod';

export const requirementSchema = z
  .object({
    id: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),
    description: z.string().trim().min(8).max(700),
    metric: z.string().regex(/^[a-zA-Z0-9_]{1,80}$/),
    comparison: z.enum(['lte', 'gte', 'eq']),
    target: z.number().finite(),
    unit: z.string().trim().min(1).max(50),
  })
  .strict();

export const revisionSchema = z
  .object({
    baseRevisionId: z.string().uuid().nullable(),
    templateId: z.enum(['gcd', 'fifo', 'mac']),
    topModule: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]{0,100}$/),
    specification: z.string().trim().min(10).max(16000),
    requirements: z
      .array(requirementSchema)
      .min(1)
      .max(40)
      .refine((items) => new Set(items.map((item) => item.id)).size === items.length, 'Requirement IDs must be unique'),
    rtl: z.string().min(10).max(160000),
    sdc: z.string().max(40000),
    testbench: z.string().max(100000),
    properties: z.string().max(60000),
  })
  .strict();

export const projectAttachmentSchema = z
  .object({
    projectId: z.string().uuid(),
    revisionId: z.string().uuid(),
    runId: z.string().uuid().optional(),
    includeRtl: z.boolean(),
    includeConstraints: z.boolean(),
    includeReport: z.boolean(),
    artifactIds: z.array(z.string().uuid()).max(4),
    view: z.enum(['learn', 'engineer']),
    hintLevel: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  })
  .strict();

export const measurementSchema = z
  .object({
    revisionId: z.string().uuid(),
    requirementId: z.string().min(1).max(80),
    stage: z.enum(['fpga', 'board', 'silicon']),
    observed: z.number().finite(),
    unit: z.string().trim().min(1).max(50),
    device: z.string().trim().min(3).max(300),
    instrument: z.string().trim().min(3).max(300),
    measuredAt: z.string().datetime(),
    evidenceArtifactId: z.string().uuid(),
  })
  .strict();
