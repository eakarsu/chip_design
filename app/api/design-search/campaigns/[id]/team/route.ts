import { z } from 'zod';
import { workspaceOperation } from '@/lib/commercial/http';
import { journeyBody } from '@/lib/journey/http';
import { agentTeamForCampaign, retryAgentTeam, startAgentTeam } from '@/lib/design-search/team';

export const runtime = 'nodejs';
type Context = { params: Promise<{ id: string }> };
const actionSchema = z.object({ action: z.enum(['start', 'retry']) }).strict();

export async function GET(request: Request, context: Context) {
  const { id } = await context.params;
  return workspaceOperation(request, 'design-search.team.read', async (identity) =>
    agentTeamForCampaign(identity, z.string().uuid().parse(id)));
}

export async function POST(request: Request, context: Context) {
  const { id } = await context.params;
  return workspaceOperation(request, 'design-search.team.update', async (identity) => {
    const campaignId = z.string().uuid().parse(id);
    const { action } = actionSchema.parse(await journeyBody(request));
    return action === 'start'
      ? startAgentTeam(identity, campaignId)
      : retryAgentTeam(identity, campaignId);
  }, ['admin', 'editor']);
}
