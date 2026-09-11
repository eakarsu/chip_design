/** Models the chat may request: the configured specialist, optional extras from
 *  OPENROUTER_COPILOT_MODELS (comma separated) and the approved fallback. */
export function copilotModels(): string[] {
  return [
    ...new Set(
      [
        process.env.OPENROUTER_MODEL,
        ...(process.env.OPENROUTER_COPILOT_MODELS ?? '').split(','),
        process.env.OPENROUTER_COPILOT_FALLBACK_MODEL,
      ]
        .map((model) => model?.trim())
        .filter((model): model is string => Boolean(model))
    ),
  ];
}
