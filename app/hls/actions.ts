'use server';

/**
 * Deterministic, ungoverned source scan for the HLS refactor tab.
 *
 * The governed `POST /api/hls/refactor` route bundles the same scan with an LLM
 * draft (and therefore requires an admin/editor identity). This Server Action
 * exposes only the deterministic scan, so the findings table can be produced
 * without a workspace session; it never calls a model and performs no
 * compilation, simulation, or synthesis.
 */
import { analyzeSynthesizability, type RefactorAnalysis } from '@/lib/hls/refactor';

export async function scanSource(source: string, filename?: string): Promise<RefactorAnalysis> {
  const trimmedName = typeof filename === 'string' ? filename.trim().slice(0, 200) : '';
  return analyzeSynthesizability(source, trimmedName || undefined);
}
