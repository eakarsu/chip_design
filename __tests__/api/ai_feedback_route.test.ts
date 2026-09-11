/** @jest-environment node */

process.env.CHIP_DB_PATH = ':memory:';

import { GET, POST } from '../../app/api/ai/feedback/route';
import { aiFeedbackSummary, recordAiFeedback } from '@/lib/ai/feedback';
import { getRawDb } from '@/lib/db/connection';

const request = (body: unknown, headers: Record<string, string> = {}) =>
  new Request('http://test/api/ai/feedback', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  getRawDb().exec('DELETE FROM ai_feedback');
});

describe('/api/ai/feedback', () => {
  it('records an anonymous rating', async () => {
    const response = await POST(
      request({
        rating: 'up',
        mode: 'chat',
        question: 'Where is the academy?',
        answer: 'Open Academy from the sidebar.',
        page: '/learn',
        model: 'test/model',
      }) as never
    );
    expect(response.status).toBe(201);
    expect((await response.json()).ok).toBe(true);
    const rows = getRawDb()
      .prepare('SELECT rating, mode, page, model FROM ai_feedback')
      .all() as Array<{ rating: string; mode: string; page: string; model: string }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ rating: 'up', mode: 'chat', page: '/learn', model: 'test/model' });
  });

  it('rejects an invalid rating before touching the database', async () => {
    const response = await POST(request({ rating: 'sideways' }) as never);
    expect(response.status).toBe(400);
    expect(getRawDb().prepare('SELECT COUNT(*) AS n FROM ai_feedback').get()).toMatchObject({ n: 0 });
  });

  it('requires an admin session for the rollup', async () => {
    const response = await GET(new Request('http://test/api/ai/feedback') as never);
    expect(response.status).toBe(401);
  });

  it('summarizes ratings by outcome and mode', () => {
    recordAiFeedback({ rating: 'up', mode: 'chat' });
    recordAiFeedback({ rating: 'up', mode: 'chat' });
    recordAiFeedback({ rating: 'down', mode: 'review' });
    const summary = aiFeedbackSummary();
    expect(summary.total).toBe(3);
    expect(summary.up).toBe(2);
    expect(summary.down).toBe(1);
    expect(summary.byMode).toEqual(
      expect.arrayContaining([
        { mode: 'chat', up: 2, down: 0 },
        { mode: 'review', up: 0, down: 1 },
      ])
    );
  });
});
