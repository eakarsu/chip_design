import { NextResponse } from 'next/server';
import { z } from 'zod';
import { rateLimit } from '@/lib/rateLimit';
import { requireAdmin, requireAuth } from '@/lib/middleware/auth';
import { handleApiError } from '@/lib/middleware/errorHandler';
import { aiFeedbackSummary, recordAiFeedback } from '@/lib/ai/feedback';

export const runtime = 'nodejs';

function clientId(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0] : request.headers.get('x-real-ip') || 'unknown';
  return ip;
}

const feedbackSchema = z.object({
  rating: z.enum(['up', 'down']),
  mode: z.enum(['chat', 'review']).default('chat'),
  model: z.string().trim().max(200).optional(),
  provider: z.string().trim().max(200).optional(),
  page: z.string().trim().max(300).optional(),
  question: z.string().max(4_000).optional(),
  answer: z.string().max(20_000).optional(),
});

export async function POST(request: Request) {
  try {
    const limited = rateLimit(`ai-feedback:${clientId(request)}`, { windowMs: 60_000, maxRequests: 30 });
    if (!limited.allowed) {
      return NextResponse.json(
        {
          error: 'Rate limit exceeded',
          retryAfter: Math.ceil((limited.resetAt - Date.now()) / 1000),
        },
        { status: 429 }
      );
    }
    const data = feedbackSchema.parse(await request.json());
    // Ratings are accepted from signed-in users and anonymous readers; the
    // session identity is attached when available for the admin rollup.
    const guard = await requireAuth(request);
    const user = guard instanceof NextResponse ? null : guard.user;
    const record = recordAiFeedback({ ...data, userId: user?.id, tenantId: user?.tenantId });
    return NextResponse.json({ ok: true, ...record }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function GET(request: Request) {
  const guard = await requireAdmin(request);
  if (guard instanceof NextResponse) return guard;
  return NextResponse.json(aiFeedbackSummary());
}
