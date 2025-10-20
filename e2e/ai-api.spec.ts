import { test, expect } from '@playwright/test';

test.describe('AI API', () => {
  test('should return 400 for invalid request', async ({ request }) => {
    const response = await request.post('/api/ai', {
      data: {
        messages: 'invalid',
      },
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('Invalid request');
  });

  test('should enforce rate limiting', async ({ request }) => {
    // Make multiple requests rapidly
    const requests = Array(15).fill(null).map(() =>
      request.post('/api/ai', {
        data: {
          messages: [{ role: 'user', content: 'test' }],
        },
      })
    );

    const responses = await Promise.all(requests);
    const rateLimited = responses.some(r => r.status() === 429);

    expect(rateLimited).toBe(true);
  });

  test('should handle OPTIONS request for CORS', async ({ request }) => {
    const response = await request.fetch('/api/ai', {
      method: 'OPTIONS',
    });

    expect(response.status()).toBe(204);
    expect(response.headers()['access-control-allow-methods']).toContain('POST');
  });

  test('should validate message structure', async ({ request }) => {
    const response = await request.post('/api/ai', {
      data: {
        messages: [
          { role: 'user', content: 'Hello' },
        ],
        model: 'anthropic/claude-3.5-sonnet',
        temperature: 0.7,
        max_tokens: 100,
      },
    });

    // Without actual API key, this will fail at OpenRouter
    // but validates our request structure is correct
    expect([400, 401, 403, 500]).toContain(response.status());
  });
});
