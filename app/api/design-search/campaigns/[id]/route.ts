import { z } from 'zod';
import { workspaceOperation } from '@/lib/commercial/http';
import { journeyBody } from '@/lib/journey/http';
import { adoptSelectedRtl, dispatchRtlVerification, dispatchSearchBatch, dispatchSearchCandidate, generateSearchCandidates, researchCampaign, searchCampaignDetails, selectSearchCandidate } from '@/lib/design-search/store';

export const runtime = 'nodejs';
type Context = { params: Promise<{ id: string }> };
const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('research') }).strict(),
  z.object({ action: z.literal('propose') }).strict(),
  z.object({ action: z.literal('verify'), candidateId: z.string().uuid() }).strict(),
  z.object({ action: z.literal('dispatch'), candidateId: z.string().uuid() }).strict(),
  z.object({ action: z.literal('dispatchBatch') }).strict(),
  z.object({ action: z.literal('select'), candidateId: z.string().uuid(), rationale: z.string().trim().min(20).max(1000) }).strict(),
  z.object({ action: z.literal('adopt') }).strict(),
]);

export async function GET(request: Request, context: Context) {
  const { id } = await context.params;
  return workspaceOperation(request, 'design-search.read', async (identity) => searchCampaignDetails(identity, z.string().uuid().parse(id)));
}

export async function POST(request: Request, context: Context) {
  const { id } = await context.params;
  return workspaceOperation(request, 'design-search.update', async (identity, requestId) => {
    const campaignId = z.string().uuid().parse(id);
    const input = actionSchema.parse(await journeyBody(request));
    if (input.action === 'research') {
      await researchCampaign(identity, campaignId, requestId);
      return searchCampaignDetails(identity, campaignId);
    }
    if (input.action === 'propose') return generateSearchCandidates(identity, campaignId, requestId);
    if (input.action === 'verify') return dispatchRtlVerification(identity, campaignId, input.candidateId, requestId);
    if (input.action === 'dispatchBatch') return dispatchSearchBatch(identity, campaignId, requestId);
    if (input.action === 'adopt') return adoptSelectedRtl(identity, campaignId, requestId);
    if (input.action === 'select') return selectSearchCandidate(identity, campaignId, input.candidateId, input.rationale, requestId);
    return dispatchSearchCandidate(identity, campaignId, input.candidateId, requestId);
  }, ['admin', 'editor']);
}
