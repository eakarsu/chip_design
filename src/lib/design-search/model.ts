import 'server-only';

export type SearchAgentRole = 'research' | 'design' | 'critic';

/** Each role can use a separately approved model without changing the workflow. */
export function searchAgentModel(role: SearchAgentRole): string {
  if (process.env.OPENROUTER_REQUIRE_ZDR === 'false' || process.env.OPENROUTER_ALLOW_DATA_COLLECTION === 'true') {
    throw new Error('Design Search requires an OpenRouter route with zero data retention and data collection denied');
  }
  const key = `CHIP_SEARCH_${role.toUpperCase()}_MODEL`;
  const model = process.env[key]?.trim() || process.env.OPENROUTER_MODEL?.trim();
  if (!model) throw new Error(`Configure ${key} or an approved OPENROUTER_MODEL before running the ${role} agent`);
  return model;
}
