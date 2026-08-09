import { z } from 'zod';
import { workspaceOperation } from '@/lib/commercial/http';
import { createFeatureRecord } from '@/lib/commercial/store';

const supported = ['spice-regression', 'co-design', 'library-marketplace'] as const;
const schema = z.object({ projectId: z.string().uuid(), recordType: z.string().trim().min(2).max(80), title: z.string().trim().min(4).max(180), status: z.string().trim().min(2).max(40), payload: z.record(z.unknown()), evidence: z.array(z.string().trim().min(1).max(500)).min(1).max(20) });

export async function POST(request: Request, { params }: { params: Promise<{ feature: string }> }) {
  return workspaceOperation(request, 'workspace.feature.create', async (identity, id) => {
    const feature = z.enum(supported).parse((await params).feature);
    return { record: await createFeatureRecord(identity, { ...schema.parse(await request.json()), feature }, id) };
  }, ['admin', 'editor']);
}
