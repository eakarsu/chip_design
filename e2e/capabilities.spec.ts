import { expect, test } from '@playwright/test';

test.describe('Capability execution workbenches', () => {
  test('protects the capability center and preserves its destination', async ({ page }) => {
    await page.goto('/capabilities');
    await expect(page).toHaveURL(/\/login\?redirect=%2Fcapabilities/);
  });

  test('rejects unauthenticated capability execution', async ({ request }) => {
    const response = await request.post('/api/capabilities/execute', {
      data: {
        projectId: '00000000-0000-4000-8000-000000000001',
        capabilityId: 'verification-closure',
        actionId: 'uvm-regression',
        input: { tests: [] },
      },
    });
    expect(response.status()).toBe(401);
  });

  test('rejects unauthenticated AI design-step retention', async ({ request }) => {
    const response = await request.post('/api/ai-design/steps', {
      data: {
        projectId: '00000000-0000-4000-8000-000000000001',
        workflowId: 'guided-design-intake',
        stepId: 'design-intent',
        owner: 'Chief architect',
        summary: 'Governed design intent baseline for the selected project.',
        status: 'complete',
        evidence: ['requirements://baseline-v1'],
      },
    });
    expect(response.status()).toBe(401);
  });

  test('rejects unauthenticated governed EDA project discovery', async ({ request }) => {
    const response = await request.get('/api/capabilities/eda-projects');
    expect(response.status()).toBe(401);
  });
});
