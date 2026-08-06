import 'server-only';

import { z } from 'zod';
import { generateJSONCompletion } from '@/lib/openrouter';
import type { DecisionBrief } from './types';

const briefSchema = z.object({
  headline: z.string().min(5).max(180),
  executiveSummary: z.string().min(20).max(1600),
  risk: z.enum(['low', 'moderate', 'high', 'critical']),
  confidence: z.number().min(0).max(100),
  metrics: z.array(z.object({ label: z.string().min(1).max(100), value: z.string().min(1).max(220) })).max(12),
  sections: z.array(z.object({ title: z.string().min(1).max(120), detail: z.string().min(1).max(1600) })).min(1).max(8),
  actions: z.array(z.string().min(2).max(300)).min(1).max(10),
  evidence: z.array(z.string().min(1).max(300)).max(15),
  assumptions: z.array(z.string().min(1).max(300)).max(10),
  humanReviewGates: z.array(z.string().min(1).max(300)).min(1).max(10),
});

export async function createAiDecisionBrief(input: {
  projectId: string;
  feature: string;
  title: string;
  context: Record<string, unknown>;
  evidence: string[];
}): Promise<Omit<DecisionBrief, 'id' | 'createdAt'>> {
  const model = process.env.OPENROUTER_MODEL ?? 'anthropic/claude-3.5-sonnet';
  const response = await generateJSONCompletion(
    `Create a chip-design engineering decision brief for the following governed workspace record.\n\nFeature: ${input.feature}\nTitle: ${input.title}\nEvidence references: ${JSON.stringify(input.evidence)}\nStructured context: ${JSON.stringify(input.context)}\n\nReturn only the requested JSON object. Never claim tape-out approval or foundry qualification. Distinguish measured evidence from prediction. Include specific human verification gates.`,
    {
      model,
      systemPrompt: `You are a senior semiconductor design-review assistant. Return JSON with exactly these keys: headline, executiveSummary, risk, confidence (0-100 number), metrics [{label,value}], sections [{title,detail}], actions [string], evidence [string], assumptions [string], humanReviewGates [string]. Be concise, professional, evidence-grounded, and explicit about simulations or missing signoff data.`,
    },
  );
  const parsed = briefSchema.parse(response);
  return {
    projectId: input.projectId,
    feature: input.feature,
    ...parsed,
    provider: 'OpenRouter',
    model,
    humanStatus: 'pending',
  };
}
