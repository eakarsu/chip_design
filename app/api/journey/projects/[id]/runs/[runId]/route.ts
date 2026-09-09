import { workspaceOperation } from '@/lib/commercial/http';
import { getJourneyRun, journeyRunInputs } from '@/lib/journey/store';

export async function GET(request: Request, context: { params: Promise<{ id: string; runId: string }> }) {
  const { id, runId } = await context.params;
  return workspaceOperation(request, 'journey.run.read', async (identity) => ({
    run: await getJourneyRun(identity, id, runId),
    inputs: await journeyRunInputs(identity, id, runId),
  }));
}
