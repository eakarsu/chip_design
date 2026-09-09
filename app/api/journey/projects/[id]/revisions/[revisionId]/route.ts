import { workspaceOperation } from '@/lib/commercial/http';
import { getRevision } from '@/lib/journey/store';
import { hardwareChecklist } from '@/lib/journey/hardware';

export async function GET(request: Request, context: { params: Promise<{ id: string; revisionId: string }> }) {
  const { id, revisionId } = await context.params;
  return workspaceOperation(request, 'journey.revision.read', async (identity) => ({
    revision: await getRevision(identity, id, revisionId),
    checklist: await hardwareChecklist(identity, id, revisionId),
  }));
}
