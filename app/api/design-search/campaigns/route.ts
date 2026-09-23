import { z } from 'zod';
import { workspaceOperation } from '@/lib/commercial/http';
import { journeyBody } from '@/lib/journey/http';
import { createSearchCampaign, listSearchCampaigns, searchCampaignDetails } from '@/lib/design-search/store';

export const runtime = 'nodejs';

const createSchema = z.object({
  projectId: z.string().uuid(),
  revisionId: z.string().uuid(),
  objective: z.enum(['min_area', 'min_power', 'balanced']),
  topic: z.enum(['placement', 'rtl']),
  maxCandidates: z.number().int().min(2).max(12),
  maxCpuSeconds: z.number().int().min(120).max(43_200),
  jobCpuSeconds: z.number().int().min(120).max(3600),
}).strict();

export async function GET(request: Request) {
  return workspaceOperation(request, 'design-search.list', async (identity) => {
    const projectId = new URL(request.url).searchParams.get('projectId');
    if (projectId) z.string().uuid().parse(projectId);
    return { campaigns: await listSearchCampaigns(identity, projectId ?? undefined) };
  });
}

export async function POST(request: Request) {
  return workspaceOperation(request, 'design-search.create', async (identity, requestId) => {
    const campaign = await createSearchCampaign(identity, createSchema.parse(await journeyBody(request)), requestId);
    return searchCampaignDetails(identity, campaign.id);
  }, ['admin', 'editor']);
}
