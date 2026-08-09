/**
 * OpenRouter AI Client
 * Wrapper for OpenRouter API using OpenAI SDK
 */

import OpenAI from 'openai';

let openRouterClient: OpenAI | undefined;

function getOpenRouterClient(): OpenAI {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('OpenRouter is not configured. Set OPENROUTER_API_KEY in the runtime environment.');
  }
  openRouterClient ??= new OpenAI({
    baseURL: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
    apiKey,
    timeout: Number(process.env.OPENROUTER_TIMEOUT_MS ?? 90_000),
    maxRetries: Number(process.env.OPENROUTER_MAX_RETRIES ?? 2),
    defaultHeaders: {
      'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000',
      'X-Title': 'NeuralChip AI Platform',
    },
  });
  return openRouterClient;
}

// Keep the established, mockable interface while constructing the SDK client
// only for a real request. Next.js imports route modules while collecting build
// metadata, and image builds must never require or embed an API credential.
export const openrouter = {
  chat: {
    completions: {
      create(
        body: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming,
        options?: { maxRetries?: number; timeout?: number },
      ) {
        return getOpenRouterClient().chat.completions.create(body, options);
      },
    },
  },
};

/**
 * OpenRouter routing policy shared by every AI endpoint. Confidential chip
 * evidence must not silently fall back to a provider that retains prompts.
 */
export function openRouterProviderPreferences(requireParameters = false) {
  return {
    require_parameters: requireParameters,
    data_collection: process.env.OPENROUTER_ALLOW_DATA_COLLECTION === 'true' ? 'allow' as const : 'deny' as const,
    zdr: process.env.OPENROUTER_REQUIRE_ZDR !== 'false',
  };
}

/**
 * Available models on OpenRouter
 */
export const MODELS = {
  // Fast and cheap for simple tasks
  CLAUDE_HAIKU: 'anthropic/claude-3-haiku',
  GPT_3_5: 'openai/gpt-3.5-turbo',

  // Balanced performance
  CLAUDE_SONNET: 'anthropic/claude-3.5-sonnet',
  GPT_4: 'openai/gpt-4-turbo',

  // Most capable
  CLAUDE_OPUS: 'anthropic/claude-3-opus',
  GPT_4O: 'openai/gpt-4o',
} as const;

type OpenRouterMessage = Omit<OpenAI.Chat.ChatCompletionMessage, 'content'> & {
  content?: string | Array<{ type?: string; text?: string }> | null;
  refusal?: string | null;
};

function messageText(message: OpenRouterMessage | undefined): string {
  if (!message) return '';
  if (typeof message.content === 'string') return message.content.trim();
  if (Array.isArray(message.content)) {
    return message.content
      .map(part => typeof part?.text === 'string' ? part.text : '')
      .filter(Boolean)
      .join('\n')
      .trim();
  }
  return '';
}

function parseStructuredResponse<T>(response: string): T {
  const trimmed = response.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = (fenced?.[1] ?? trimmed).trim();

  try {
    return JSON.parse(candidate) as T;
  } catch {
    // Never log a provider response: it may contain confidential design context.
    throw new Error('AI returned invalid JSON');
  }
}

function providerError(error: unknown): Error {
  const message = error instanceof Error ? error.message : '';
  if (/zero data retention|data policy/i.test(message)) {
    return new Error('No OpenRouter endpoint satisfies the configured confidential-design data policy. Keep zero-data retention enabled, or explicitly set OPENROUTER_REQUIRE_ZDR=false only after approving that privacy tradeoff.');
  }
  if (/timed out|timeout/i.test(message)) return new Error('OpenRouter chip-design review timed out before a complete structured response was available. Retry once, reduce the evidence payload, or select a faster approved model.');
  if (error instanceof OpenAI.APIError && error.status === 401) return new Error('OpenRouter authentication failed; verify the server-side API key.');
  if (error instanceof OpenAI.APIError && error.status === 429) return new Error('OpenRouter rate or credit limit reached; retry after capacity is available.');
  if (error instanceof OpenAI.APIError && error.status && error.status >= 500) return new Error('OpenRouter or its selected model provider is temporarily unavailable.');
  return error instanceof Error ? error : new Error('OpenRouter request failed.');
}

/**
 * Generate AI completion
 */
export async function generateCompletion(
  prompt: string,
  options?: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    systemPrompt?: string;
  }
): Promise<string> {
  const {
    model = MODELS.CLAUDE_HAIKU, // Use fast, cheap model by default
    temperature = 0.7,
    maxTokens = 1000,
    systemPrompt,
  } = options || {};

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }

  messages.push({ role: 'user', content: prompt });

  const completion = await openrouter.chat.completions.create({
    model,
    messages,
    temperature,
    max_tokens: maxTokens,
    provider: openRouterProviderPreferences(),
  } as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming & {
    provider: ReturnType<typeof openRouterProviderPreferences>;
  });

  return completion.choices[0]?.message?.content || '';
}

/**
 * Generate JSON completion (for structured output)
 */
export async function generateJSONCompletion<T = unknown>(
  prompt: string,
  options?: {
    model?: string;
    systemPrompt?: string;
    maxTokens?: number;
    temperature?: number;
    jsonSchema?: Record<string, unknown>;
    schemaName?: string;
    reasoningMaxTokens?: number;
    timeoutMs?: number;
    preferJsonObject?: boolean;
  }
): Promise<T> {
  const model = options?.model ?? MODELS.CLAUDE_SONNET;
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
  if (options?.systemPrompt) messages.push({ role: 'system', content: options.systemPrompt });
  messages.push({ role: 'user', content: prompt });

  const request = {
    model,
    messages,
    temperature: options?.temperature ?? 0.1,
    max_tokens: options?.maxTokens ?? 6_000,
    response_format: options?.jsonSchema && !options.preferJsonObject ? {
      type: 'json_schema' as const,
      json_schema: {
        name: options.schemaName ?? 'structured_response',
        strict: true,
        schema: options.jsonSchema,
      },
    } : { type: 'json_object' as const },
    provider: openRouterProviderPreferences(Boolean(options?.jsonSchema && !options.preferJsonObject)),
    plugins: [{ id: 'response-healing' }],
    ...(options?.reasoningMaxTokens ? { reasoning: { max_tokens: options.reasoningMaxTokens, exclude: true } } : {}),
  } as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming & {
    provider: { require_parameters: boolean; data_collection: 'allow' | 'deny'; zdr: boolean };
    plugins: Array<{ id: string }>;
    reasoning?: { max_tokens: number; exclude: boolean };
  };

  const createStructuredCompletion = (payload: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming) =>
    openrouter.chat.completions.create(payload, { maxRetries: 0, timeout: options?.timeoutMs ?? 60_000 });

  const isZdrStructuredRoutingConflict = (error: unknown) =>
    /no endpoints found.*(?:data policy|zero data retention)/i.test(error instanceof Error ? error.message : '');

  const createWithoutResponseFormat = (payload: typeof request) => {
    const compatibleRequest = { ...payload };
    delete compatibleRequest.response_format;
    compatibleRequest.provider = { ...payload.provider, require_parameters: false };
    return createStructuredCompletion(compatibleRequest);
  };

  let completion: OpenAI.Chat.ChatCompletion;
  try {
    completion = await createStructuredCompletion(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (options?.jsonSchema && !options.preferJsonObject && /no endpoints found.*requested parameters/i.test(message)) {
      const compatibleRequest = {
        ...request,
        response_format: { type: 'json_object' as const },
        provider: { ...request.provider, require_parameters: false },
      } as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming & {
        provider: { require_parameters: boolean; data_collection: 'allow' | 'deny'; zdr: boolean };
        plugins: Array<{ id: string }>;
        reasoning?: { max_tokens: number; exclude: boolean };
      };
      try {
        completion = await createStructuredCompletion(compatibleRequest);
      } catch (fallbackError) {
        if (isZdrStructuredRoutingConflict(fallbackError)) {
          try {
            completion = await createWithoutResponseFormat(compatibleRequest);
          } catch (transportFallbackError) {
            throw providerError(transportFallbackError);
          }
        } else {
          throw providerError(fallbackError);
        }
      }
    } else if (isZdrStructuredRoutingConflict(error)) {
      try {
        completion = await createWithoutResponseFormat(request);
      } catch (fallbackError) {
        throw providerError(fallbackError);
      }
    } else {
      throw providerError(error);
    }
  }

  let response = messageText(completion.choices[0]?.message as OpenRouterMessage | undefined);
  let firstFailure = response ? 'AI returned invalid JSON' : 'AI returned an empty structured response';
  if (response) {
    try {
      return parseStructuredResponse<T>(response);
    } catch (error) {
      firstFailure = error instanceof Error ? error.message : firstFailure;
    }
  }

  // Some providers spend the entire budget on hidden reasoning, return content
  // parts rather than a string, or terminate strict-schema output early. Make one
  // bounded recovery request without reasoning and with the broadly-supported
  // JSON-object contract. The design record is unchanged and remains subject to
  // the same provider privacy policy.
  const requestWithoutReasoning = { ...request };
  delete requestWithoutReasoning.reasoning;
  const recoveryRequest = {
    ...requestWithoutReasoning,
    max_tokens: Math.max(options?.maxTokens ?? 6_000, 8_000),
    temperature: 0,
    response_format: { type: 'json_object' as const },
    provider: { ...request.provider, require_parameters: false },
    messages: [
      ...messages,
      {
        role: 'user' as const,
        content: 'Return the complete JSON object now. Do not include markdown, commentary, analysis, or code fences. Include every field required by the system output contract.',
      },
    ],
  } as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming & {
    provider: { require_parameters: boolean; data_collection: 'allow' | 'deny'; zdr: boolean };
    plugins: Array<{ id: string }>;
  };

  try {
    completion = await createStructuredCompletion(recoveryRequest);
  } catch (error) {
    if (isZdrStructuredRoutingConflict(error)) {
      try {
        completion = await createWithoutResponseFormat(recoveryRequest);
      } catch (fallbackError) {
        throw providerError(fallbackError);
      }
    } else {
      throw providerError(error);
    }
  }

  response = messageText(completion.choices[0]?.message as OpenRouterMessage | undefined);
  if (!response) {
    const finishReason = completion.choices[0]?.finish_reason;
    const refusal = (completion.choices[0]?.message as OpenRouterMessage | undefined)?.refusal;
    if (refusal) throw new Error('The selected AI provider declined the structured chip-design review. Revise the request or select another approved model.');
    if (finishReason === 'length') throw new Error('The selected AI model exhausted its output budget before producing the structured review. Reduce the evidence payload or select a model with a larger output limit.');
    throw new Error(`${firstFailure}; the automatic recovery request was also empty.`);
  }

  return parseStructuredResponse<T>(response);
}
