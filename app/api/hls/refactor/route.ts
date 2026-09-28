export const runtime = 'nodejs';

import { z } from 'zod';
import { workspaceOperation } from '@/lib/commercial/http';
import { invalidBodyResponse, invalidJsonResponse } from '@/lib/hls/api';
import { REFACTOR_DRAFT_MAX_SOURCE_CHARACTERS, refactorDraft } from '@/lib/hls/refactor';

const bodySchema = z.object({
  source: z.string().min(20).max(REFACTOR_DRAFT_MAX_SOURCE_CHARACTERS),
  filename: z.string().min(1).max(200).optional(),
  targetTool: z.string().min(1).max(200).optional(),
  maxFindings: z.number().int().min(1).max(100).optional(),
}).strict();

/**
 * Deterministic synthesizability scan plus an LLM refactoring DRAFT. The draft
 * is never compiled or synthesized here, and the response says so explicitly.
 *
 * Governance: this route is a workspace operation and requires an
 * admin/editor identity via {@link workspaceOperation}. The body is validated
 * first so invalid input gets the same readable 422 as the other HLS routes.
 */
export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return invalidJsonResponse();
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return invalidBodyResponse(parsed.error);

  return workspaceOperation(
    request,
    'hls.refactor',
    async () => refactorDraft(parsed.data),
    ['admin', 'editor'],
  );
}
