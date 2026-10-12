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

  it('applies one wall-clock timeout budget across the initial and recovery requests', async () => {
    const create = jest.spyOn(openrouter.chat.completions, 'create')
      .mockResolvedValueOnce({
        id: 'empty', object: 'chat.completion', created: 1, model: 'test',
        choices: [{ index: 0, finish_reason: 'length', logprobs: null, message: { role: 'assistant', content: '', refusal: null } }],
      } as never)
      .mockImplementationOnce(() => new Promise(() => undefined) as never);

    const startedAt = Date.now();
    await expect(generateJSONCompletion('review', { timeoutMs: 30 })).rejects.toThrow(/timed out/i);
    expect(Date.now() - startedAt).toBeLessThan(250);
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[1][1]?.timeout).toBeLessThanOrEqual(30);
  });

  it('passes operator cancellation into the provider and prevents recovery requests', async () => {
    const controller = new AbortController();
    const create = jest.spyOn(openrouter.chat.completions, 'create').mockImplementation(() => new Promise(() => undefined) as never);
    const request = generateJSONCompletion('Actual retained evidence', { signal:controller.signal });
    const rejected = expect(request).rejects.toMatchObject({name:'AbortError'});
    await new Promise(resolve => setTimeout(resolve,5));
    const providerSignal = create.mock.calls[0][1]?.signal;
    controller.abort(); await rejected;
    expect(providerSignal?.aborted).toBe(true);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('does not call the provider for a request cancelled before generation', async () => {
    const controller = new AbortController(); controller.abort();
    const create = jest.spyOn(openrouter.chat.completions,'create');
    await expect(generateJSONCompletion('Actual evidence',{signal:controller.signal})).rejects.toMatchObject({name:'AbortError'});
    expect(create).not.toHaveBeenCalled();
  });
});
