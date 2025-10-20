/**
 * OpenRouter AI Client
 * Wrapper for OpenRouter API using OpenAI SDK
 */

import OpenAI from 'openai';

// Initialize OpenRouter client
export const openrouter = new OpenAI({
  baseURL: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY,
  defaultHeaders: {
    'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000',
    'X-Title': 'NeuralChip AI Platform',
  },
});

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
  });

  return completion.choices[0]?.message?.content || '';
}

/**
 * Generate JSON completion (for structured output)
 */
export async function generateJSONCompletion<T = any>(
  prompt: string,
  options?: {
    model?: string;
    systemPrompt?: string;
  }
): Promise<T> {
  const response = await generateCompletion(prompt, {
    ...options,
    temperature: 0.3, // Lower temperature for more consistent JSON
  });

  // Extract JSON from response (handles markdown code blocks)
  const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/) ||
                   response.match(/```\n([\s\S]*?)\n```/) ||
                   [null, response];

  const jsonStr = jsonMatch[1] || response;

  try {
    return JSON.parse(jsonStr.trim());
  } catch (error) {
    console.error('Failed to parse JSON from AI response:', jsonStr);
    throw new Error('AI returned invalid JSON');
  }
}
