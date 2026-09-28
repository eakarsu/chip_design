/** @jest-environment node */
import { GET, POST } from '../../app/api/ai/copilot/route';
import { copilotModels } from '@/lib/ai/copilotModels';

const originalEnv = { ...process.env };
let requestNumber = 0;
const request = (body: Record<string, unknown>) =>
  new Request('http://test/api/ai/copilot', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': `copilot-model-test-${++requestNumber}`,
    },
    body: JSON.stringify({ messages: [{ role: 'user', content: 'Hello' }], ...body }),
  });

afterEach(() => {
  jest.restoreAllMocks();
  process.env.OPENROUTER_MODEL = originalEnv.OPENROUTER_MODEL;
  process.env.OPENROUTER_COPILOT_MODELS = originalEnv.OPENROUTER_COPILOT_MODELS;
  process.env.OPENROUTER_COPILOT_FALLBACK_MODEL = originalEnv.OPENROUTER_COPILOT_FALLBACK_MODEL;
});

describe('copilot model allowlist', () => {
  it('lists the configured specialist, extras and fallback once each', () => {
    process.env.OPENROUTER_MODEL = 'primary/model';
    process.env.OPENROUTER_COPILOT_MODELS = 'extra/one, extra/two, primary/model';
    process.env.OPENROUTER_COPILOT_FALLBACK_MODEL = 'fallback/model';
    expect(copilotModels()).toEqual(['primary/model', 'extra/one', 'extra/two', 'fallback/model']);
  });

  it('does not expose the provider or model names from GET', async () => {
    process.env.OPENROUTER_MODEL = 'primary/model';
    process.env.OPENROUTER_COPILOT_MODELS = 'extra/model';
    delete process.env.OPENROUTER_COPILOT_FALLBACK_MODEL;
    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).not.toHaveProperty('models');
    expect(body).not.toHaveProperty('default');
    expect(body).not.toHaveProperty('displayName');
    expect(JSON.stringify(body)).not.toContain('primary/model');
    expect(JSON.stringify(body)).not.toContain('extra/model');
  });

  it('rejects a model outside the allowlist before calling the provider', async () => {
    process.env.OPENROUTER_MODEL = 'primary/model';
    delete process.env.OPENROUTER_COPILOT_MODELS;
    delete process.env.OPENROUTER_COPILOT_FALLBACK_MODEL;
    const fetchMock = jest.fn();
    global.fetch = fetchMock as typeof fetch;
    const response = await POST(request({ mode: 'chat', model: 'untrusted/model' }) as never);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: 'AI_MODEL_NOT_ALLOWED', models: ['primary/model'] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('forwards an allowed model without leaking it in response headers', async () => {
    process.env.OPENROUTER_MODEL = 'primary/model';
    process.env.OPENROUTER_COPILOT_MODELS = 'extra/model';
    const streamBody = 'data: {"choices":[{"delta":{"content":"Hi"}}]}\n\ndata: [DONE]\n\n';
    const fetchMock = jest.fn().mockResolvedValueOnce(
      new Response(streamBody, { status: 200, headers: { 'content-type': 'text/event-stream' } })
    );
    global.fetch = fetchMock as typeof fetch;
    const response = await POST(
      request({ mode: 'chat', model: 'extra/model', stream: true, pageContext: { pathname: '/workspace' } }) as never
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('x-copilot-model')).toBeNull();
    expect(response.headers.get('x-copilot-mode')).toBe('chat');
    expect(response.headers.get('x-copilot-sources')).toBeTruthy();
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).model).toBe('extra/model');
    expect(await response.text()).toBe(streamBody);
  });
});
