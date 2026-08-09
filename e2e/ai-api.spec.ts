import { test, expect } from '@playwright/test';

test.describe('AI API', () => {
  const allowedOrigin = 'http://127.0.0.1:30815';

  test('should return 400 for invalid request', async ({ request }) => {
    const response = await request.post('/api/ai', {
      headers: {
        Origin: allowedOrigin,
        'X-Forwarded-For': '192.0.2.10',
      },
      data: {
        messages: 'invalid',
      },
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('Invalid request');
  });

  test('should enforce rate limiting', async ({ request }) => {
    // Invalid payloads exercise the local limiter without contacting the AI
    // provider. A dedicated client address keeps this test isolated.
    const requests = Array(15).fill(null).map(() =>
      request.post('/api/ai', {
        headers: {
          Origin: allowedOrigin,
          'X-Forwarded-For': '192.0.2.20',
        },
        data: {
          messages: 'invalid',
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
      headers: {
        Origin: allowedOrigin,
      },
    });

    expect(response.status()).toBe(204);
    expect(response.headers()['access-control-allow-methods']).toContain('POST');
  });

  test('should reject an invalid message role', async ({ request }) => {
    const response = await request.post('/api/ai', {
      headers: {
        Origin: allowedOrigin,
        'X-Forwarded-For': '192.0.2.30',
      },
      data: {
        messages: [
          { role: 'operator', content: 'Hello' },
        ],
      },
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('Invalid request');
  });
});
