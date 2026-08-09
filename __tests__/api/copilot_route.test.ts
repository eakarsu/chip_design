/**
 * @jest-environment node
 */
import { POST } from '../../app/api/ai/copilot/route';

const completeBrief = {
  headline: 'Architecture gate requires CDC and UPF evidence',
  executiveSummary: 'The supplied targets are usable, but the gate remains open until CDC and power-intent evidence is reviewed.',
  verdict: 'PROCEED WITH CONDITIONS',
  risk: 'MODERATE',
  confidence: 82,
  metrics: [{ label: 'CPU clock', value: '100 MHz' }],
  currentGate: {
    phase: '1. Requirements and architecture',
    status: 'IN PROGRESS',
    closureCriteria: ['Approve CDC and UPF specifications'],
    missingEvidence: ['CDC report', 'UPF review record'],
  },
  engineeringFindings: [{
    domain: 'architecture',
    severity: 'HIGH',
    finding: 'CDC evidence is missing',
    impact: 'Clock crossings cannot be signed off',
    evidence: 'NOT PROVIDED',
  }],
  prioritizedActions: [{
    priority: 'P0',
    action: 'Run CDC analysis',
    owner: 'CDC lead',
    acceptanceCriterion: 'Zero unresolved critical crossings',
  }],
  nextThreePhases: [{ phase: 'Microarchitecture', entryCondition: 'Architecture gate approved' }],
  assumptions: ['The 100 MHz source clock is stable'],
  humanReviewGates: ['Architecture lead approval'],
};

function request(): Request {
  return new Request('http://test/api/ai/copilot', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': 'copilot-route-test' },
    body: JSON.stringify({
      messages: [{ role: 'user', content: 'Review the complete 28nm IoT SoC plan.' }],
      designContext: { currentAlgorithm: 'Requirements and architecture', currentParams: { phaseId: 'requirements' } },
      stream: false,
    }),
  });
}

describe('/api/ai/copilot', () => {
  const originalFetch = global.fetch;
  const originalBaseUrl = process.env.OPENROUTER_BASE_URL;
  const originalApiKey = process.env.OPENROUTER_API_KEY;
  const originalMaxTokens = process.env.OPENROUTER_CHAT_MAX_TOKENS;

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalBaseUrl === undefined) delete process.env.OPENROUTER_BASE_URL;
    else process.env.OPENROUTER_BASE_URL = originalBaseUrl;
    if (originalApiKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = originalApiKey;
    if (originalMaxTokens === undefined) delete process.env.OPENROUTER_CHAT_MAX_TOKENS;
    else process.env.OPENROUTER_CHAT_MAX_TOKENS = originalMaxTokens;
  });

  it('automatically repairs a provider response truncated by its output limit', async () => {
    process.env.OPENROUTER_BASE_URL = 'https://openrouter.test/api/v1';
    process.env.OPENROUTER_API_KEY = 'test-only-key';
    delete process.env.OPENROUTER_CHAT_MAX_TOKENS;

    const fetchMock = jest.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: 'truncated-generation',
        model: 'test/model',
        provider: 'Test Provider',
        choices: [{ finish_reason: 'length', message: { content: '{"headline":"unfinished"' } }],
      }), { status: 200, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: 'recovered-generation',
        model: 'test/model',
        provider: 'Test Provider',
        choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(completeBrief) } }],
      }), { status: 200, headers: { 'content-type': 'application/json' } }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const response = await POST(request() as never);
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const firstPayload = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    const recoveryPayload = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
    expect(firstPayload.max_tokens).toBeGreaterThanOrEqual(3_500);
    expect(firstPayload.response_format).toEqual({ type: 'json_object' });
    expect(recoveryPayload.max_tokens).toBeGreaterThanOrEqual(6_000);
    expect(recoveryPayload.model).toBe('google/gemini-2.5-flash-lite');
    expect(recoveryPayload.reasoning).toBeUndefined();

    const result = await response.json();
    const renderedBrief = JSON.parse(result.choices[0].message.content);
    expect(result.choices[0].finish_reason).toBe('stop');
    expect(renderedBrief).toEqual(completeBrief);
  });

  it('uses the approved ZDR fallback when the configured specialist stalls', async () => {
    process.env.OPENROUTER_BASE_URL = 'https://openrouter.test/api/v1';
    process.env.OPENROUTER_API_KEY = 'test-only-key';

    const fetchMock = jest.fn()
      .mockRejectedValueOnce(new DOMException('request timed out', 'TimeoutError'))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: 'fallback-generation',
        model: 'google/gemini-2.5-flash-lite',
        provider: 'Test ZDR Provider',
        choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(completeBrief) } }],
      }), { status: 200, headers: { 'content-type': 'application/json' } }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const response = await POST(request() as never);
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const fallbackPayload = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
    expect(fallbackPayload.model).toBe('google/gemini-2.5-flash-lite');
    expect(fallbackPayload.provider).toMatchObject({ zdr: true, data_collection: 'deny' });
    expect(fallbackPayload.reasoning).toBeUndefined();

    const result = await response.json();
    expect(result.model).toBe('google/gemini-2.5-flash-lite');
    expect(JSON.parse(result.choices[0].message.content)).toEqual(completeBrief);
  });
});
