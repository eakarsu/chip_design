/**
 * Independent AI challenge for the analog design.
 *
 * The review runs against the selected model (DeepSeek V4.1 Flash by default)
 * with the same zero-data-retention policy as the rest of the platform. It is
 * advisory: findings must cite the evidence they need, and a human records the
 * disposition. No measurement is invented by the model.
 */
import { z } from 'zod';
import { openrouter, openRouterProviderPreferences } from '@/lib/openrouter';
import type { AiReviewResult, BuckDesign, PcbReviewInput, Requirements, SimulationResult } from './types';

export const aiReviewSchema = z.object({
  summary: z.string().min(20).max(6000),
  findings: z
    .array(
      z.object({
        id: z.string().min(1).max(80),
        severity: z.enum(['critical', 'high', 'medium', 'low']),
        title: z.string().min(3).max(200),
        detail: z.string().min(10).max(4000),
        requiredEvidence: z.string().min(3).max(1000),
      }),
    )
    .max(25),
  assumptions: z.array(z.string().max(1000)).max(25),
  limitations: z.array(z.string().max(1000)).max(25),
});

export interface ReviewInput {
  requirements: Requirements;
  design: BuckDesign;
  transient?: SimulationResult;
  ac?: SimulationResult;
  pcb?: PcbReviewInput;
  tuningLog?: string[];
}

const SYSTEM_PROMPT = [
  'You are an independent analog power-supply reviewer challenging a buck-converter design.',
  'Use only the supplied evidence. Never invent measurements, datasheet limits or test results.',
  'The transient model is averaged (no switching ripple); the ripple figure is an analytic estimate and must be labelled as such.',
  'Every finding must state the evidence required to close it (simulation, bench measurement, datasheet check, thermal measurement).',
  'Return ONLY a JSON object (no markdown, no commentary) with exactly these keys:',
  '{"summary": string, "findings": [{"id": string, "severity": "critical"|"high"|"medium"|"low", "title": string, "detail": string, "requiredEvidence": string}], "assumptions": string[], "limitations": string[]}',
  'Include at least two findings when the evidence shows any gap; severity must be one of the four listed words.',
].join(' ');

function extractJson(content: string): unknown | null {
  const trimmed = content.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function normalize(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  const record = value as Record<string, unknown>;
  const findings = Array.isArray(record.findings)
    ? record.findings.map((finding, index) => {
        if (!finding || typeof finding !== 'object') return finding;
        const item = finding as Record<string, unknown>;
        const severity = typeof item.severity === 'string' ? item.severity.toLowerCase().trim() : 'medium';
        const title = typeof item.title === 'string' ? item.title : `Finding ${index + 1}`;
        const id = typeof item.id === 'string' && item.id.trim() ? item.id : title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60) || `finding-${index + 1}`;
        return {
          ...item,
          id,
          severity: ['critical', 'high', 'medium', 'low'].includes(severity) ? severity : 'medium',
          requiredEvidence: typeof item.requiredEvidence === 'string' && item.requiredEvidence.trim() ? item.requiredEvidence : 'Evidence not specified by the model; the reviewer must identify it.',
        };
      })
    : record.findings;
  return { ...record, findings };
}

async function callModel(model: string, evidence: unknown, repair?: { issues: string; previous: string }) {
  const messages = [
    { role: 'system' as const, content: SYSTEM_PROMPT },
    { role: 'user' as const, content: JSON.stringify(evidence) },
  ];
  if (repair) {
    messages.push({
      role: 'user' as const,
      content: `Your previous answer was rejected by the response schema: ${repair.issues}. Previous answer (truncated): ${repair.previous.slice(0, 2000)}. Return ONLY a corrected JSON object with the exact keys and value types described.`,
    });
  }
  return openrouter.chat.completions.create(
    {
      model,
      temperature: 0.2,
      max_tokens: 4000,
      messages,
      provider: openRouterProviderPreferences(true),
      response_format: { type: 'json_object' },
    } as Parameters<typeof openrouter.chat.completions.create>[0],
  );
}

export async function runAiReview(input: ReviewInput): Promise<AiReviewResult> {
  const model = process.env.OPENROUTER_CHIP_REVIEW_MODEL ?? process.env.OPENROUTER_MODEL ?? 'deepseek/deepseek-v4.1-flash';
  const evidence = {
    requirements: input.requirements,
    design: {
      ic: input.design.ic.part,
      topology: input.design.ic.topology,
      fswHz: input.design.fswHz,
      inductanceH: input.design.inductanceH,
      deltaIlA: input.design.deltaIlA,
      outputCapEffectiveF: input.design.outputCapEffectiveF,
      estimatedRippleMv: input.design.estimatedRippleMv,
      losses: input.design.losses,
      warnings: input.design.warnings,
      calculations: input.design.calculations.map((item) => ({ label: item.label, formula: item.formula, value: item.value, unit: item.unit })),
      billOfMaterials: input.design.billOfMaterials,
    },
    transient: input.transient ? { available: input.transient.available, measurements: input.transient.measurements, checks: input.transient.checks } : null,
    ac: input.ac ? { available: input.ac.available, measurements: input.ac.measurements, checks: input.ac.checks } : null,
    pcb: input.pcb ? { checks: input.pcb.checks, reviewerNote: input.pcb.reviewerNote } : null,
    compensatorTuning: input.tuningLog ?? null,
  };

  const first = await callModel(model, evidence);
  const firstContent = first.choices[0]?.message?.content ?? '';
  let parsed = normalize(extractJson(firstContent));
  let result = aiReviewSchema.safeParse(parsed);
  let completion = first;
  if (!result.success) {
    const issues = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
    const second = await callModel(model, evidence, { issues, previous: firstContent });
    const secondContent = second.choices[0]?.message?.content ?? '';
    const secondParsed = normalize(extractJson(secondContent));
    const secondResult = aiReviewSchema.safeParse(secondParsed);
    if (!secondResult.success) {
      const secondIssues = secondResult.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
      throw new Error(`AI review returned a response that does not match the review schema (${secondIssues}). Retry or switch models.`);
    }
    result = secondResult;
    completion = second;
  }
  const usage = completion.usage as (typeof completion.usage & { cost?: number }) | undefined;
  return {
    ...result.data,
    model,
    usage: {
      promptTokens: usage?.prompt_tokens,
      completionTokens: usage?.completion_tokens,
      costUsd: typeof usage?.cost === 'number' ? usage.cost : undefined,
    },
    humanDecision: 'pending',
  };
}
