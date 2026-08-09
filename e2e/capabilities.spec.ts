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
});
