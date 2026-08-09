/** @jest-environment node */

import { generateJSONCompletion, openrouter } from '@/lib/openrouter';

describe('OpenRouter structured response recovery', () => {
  afterEach(() => jest.restoreAllMocks());

  it('accepts JSON returned in a markdown fence', async () => {
    jest.spyOn(openrouter.chat.completions, 'create').mockResolvedValueOnce({
      id: 'test', object: 'chat.completion', created: 1, model: 'test',
      choices: [{ index: 0, finish_reason: 'stop', logprobs: null, message: { role: 'assistant', content: '```json\n{"verdict":"hold"}\n```', refusal: null } }],
    } as never);

    await expect(generateJSONCompletion<{ verdict: string }>('review')).resolves.toEqual({ verdict: 'hold' });
  });

  it('recovers an empty first response without reasoning and accepts content parts', async () => {
    const create = jest.spyOn(openrouter.chat.completions, 'create')
      .mockResolvedValueOnce({
        id: 'first', object: 'chat.completion', created: 1, model: 'test',
        choices: [{ index: 0, finish_reason: 'length', logprobs: null, message: { role: 'assistant', content: '', refusal: null } }],
      } as never)
      .mockResolvedValueOnce({
        id: 'recovery', object: 'chat.completion', created: 2, model: 'test',
        choices: [{ index: 0, finish_reason: 'stop', logprobs: null, message: { role: 'assistant', content: [{ type: 'text', text: '{"verdict":"hold","confidence":88}' }], refusal: null } }],
      } as never);

    await expect(generateJSONCompletion<{ verdict: string; confidence: number }>('review', {
      reasoningMaxTokens: 1_800,
    })).resolves.toEqual({ verdict: 'hold', confidence: 88 });

    expect(create).toHaveBeenCalledTimes(2);
    const recovery = create.mock.calls[1][0] as unknown as Record<string, unknown>;
    expect(recovery).not.toHaveProperty('reasoning');
    expect(recovery).toMatchObject({ max_tokens: 8_000, temperature: 0, response_format: { type: 'json_object' } });
  });

  it('keeps ZDR active when a model rejects the JSON response-format transport parameter', async () => {
    const create = jest.spyOn(openrouter.chat.completions, 'create')
      .mockRejectedValueOnce(new Error('No endpoints found matching your data policy (Zero data retention).'))
      .mockResolvedValueOnce({
        id: 'zdr-compatible', object: 'chat.completion', created: 1, model: 'anthropic/claude-sonnet-4.5',
        choices: [{ index: 0, finish_reason: 'stop', logprobs: null, message: { role: 'assistant', content: '{"verdict":"hold","confidence":92}', refusal: null } }],
      } as never);

    await expect(generateJSONCompletion<{ verdict: string; confidence: number }>('review', {
      model: 'anthropic/claude-sonnet-4.5', preferJsonObject: true,
    })).resolves.toEqual({ verdict: 'hold', confidence: 92 });

    expect(create).toHaveBeenCalledTimes(2);
    const fallback = create.mock.calls[1][0] as unknown as Record<string, unknown>;
    expect(fallback).not.toHaveProperty('response_format');
    expect(fallback).toMatchObject({ provider: { zdr: true, data_collection: 'deny', require_parameters: false } });
  });
});
