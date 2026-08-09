import { z } from 'zod';
import { workspaceOperation } from '@/lib/commercial/http';
import { operationCategories } from '@/lib/operations/types';
import { createOperationRecord, operationsBundle, updateOperationRecord } from '@/lib/operations/store';

const categorySchema = z.enum(operationCategories);
const createSchema = z.object({
  projectId: z.string().uuid().optional(),
  category: categorySchema,
  kind: z.string().trim().min(2).max(80),
  title: z.string().trim().min(3).max(200),
  status: z.string().trim().min(2).max(40),
  ownerId: z.string().trim().min(1).max(160).optional(),
  parentId: z.string().uuid().optional(),
  payload: z.record(z.unknown()).optional(),
  evidence: z.array(z.string().trim().min(1).max(1000)).max(100).optional(),
  dueAt: z.string().datetime().optional(),
});
const updateSchema = z.object({
  id: z.string().uuid(),
  status: z.string().trim().min(2).max(40).optional(),
  ownerId: z.string().trim().min(1).max(160).optional(),
  dueAt: z.string().datetime().nullable().optional(),
  payload: z.record(z.unknown()).optional(),
  evidence: z.array(z.string().trim().min(1).max(1000)).max(100).optional(),
});

export async function GET(request: Request) {
  return workspaceOperation(request, 'operations.list', async (identity) => {
    const url = new URL(request.url);
    const projectId = url.searchParams.get('projectId') || undefined;
    if (projectId) z.string().uuid().parse(projectId);
    const categoryValue = url.searchParams.get('category');
    const category = categoryValue ? categorySchema.parse(categoryValue) : undefined;
    const bundle = await operationsBundle(identity, projectId);
    return category ? { ...bundle, records: bundle.records.filter((record) => record.category === category) } : bundle;
  });
}

export async function POST(request: Request) {
  return workspaceOperation(
    request,
    'operations.create',
    async (identity, id) => {
      const input = createSchema.parse(await request.json());
      if (JSON.stringify(input.payload ?? {}).length > 250_000) throw new Error('Operation payload exceeds 250 KB');
      return { record: await createOperationRecord(identity, input, id) };
    },
    ['admin', 'editor']
  );
}

export async function PATCH(request: Request) {
  return workspaceOperation(
    request,
    'operations.update',
    async (identity, id) => {
      const input = updateSchema.parse(await request.json());
      if (JSON.stringify(input.payload ?? {}).length > 250_000) throw new Error('Operation payload exceeds 250 KB');
      return { record: await updateOperationRecord(identity, input, id) };
    },
    ['admin', 'editor']
  );
}
