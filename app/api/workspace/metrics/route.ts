import { workspaceOperation } from '@/lib/commercial/http';
import { commercialMetrics } from '@/lib/commercial/observability';

export async function GET(request: Request) {
  return workspaceOperation(request, 'workspace.metrics', async () => ({ metrics: commercialMetrics(), generatedAt: new Date().toISOString() }), ['admin']);
}
